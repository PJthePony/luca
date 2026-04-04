import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, emailThreads, participants, users, meetingTypes, availabilityRules } from "../db/schema.js";
import { extractIntent, composeEmail, reviewEmail } from "../services/ai-pipeline.js";
import { createDraft, updateDraftWithQC } from "../services/draft-manager.js";
import {
  handleScheduleNew,
  handleConfirmTime,
  handleReschedule,
  handleDecline,
  handleAskForMoreTimes,
  handleFreeformOrUnrelated,
  buildCalendarDescription,
} from "../services/intent-handlers.js";
import type { IntentContext } from "../services/intent-handlers.js";
import type { IntentHandlerResult } from "../types/index.js";
import type { GoogleTokens } from "../types/index.js";
import { baseStyles, fontLinks, logoSvg } from "../lib/styles.js";
import { env } from "../config.js";
import { nanoid } from "nanoid";

export const simulatorRoutes = new Hono();

/**
 * Simulator page — renders the UI for testing the email pipeline.
 */
simulatorRoutes.get("/", async (c) => {
  // Get the first user (P.J.) for context
  const user = await db.query.users.findFirst();
  if (!user) return c.text("No user found", 500);

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luca — Email Simulator</title>
  ${fontLinks}
  <style>
    ${baseStyles}
    body { background: var(--nxb-color-bg); color: var(--nxb-color-text); line-height: 1.6; padding: 24px; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 1.3rem; font-weight: 600; }
    .header a { color: var(--nxb-color-text-secondary); font-size: 0.85rem; text-decoration: none; margin-left: auto; }
    .header a:hover { color: var(--nxb-color-text); }

    .sim-form { background: var(--nxb-color-surface); border: 1px solid var(--nxb-color-border); border-radius: 10px; padding: 20px; margin-bottom: 24px; }
    .sim-form h2 { font-size: 1rem; font-weight: 600; margin-bottom: 16px; color: var(--nxb-color-text-secondary); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .form-row.full { grid-template-columns: 1fr; }
    .form-group label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--nxb-color-text-secondary); margin-bottom: 4px; }
    .form-group input, .form-group textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--nxb-color-border); border-radius: 6px; font-size: 0.85rem; }
    .form-group textarea { min-height: 100px; resize: vertical; }
    .btn-run { background: var(--nxb-color-primary); color: white; padding: 8px 20px; border-radius: 6px; font-weight: 500; font-size: 0.85rem; }
    .btn-run:hover { background: var(--nxb-color-primary-hover); }
    .btn-run:disabled { opacity: 0.5; cursor: not-allowed; }

    .results { display: none; }
    .results.visible { display: block; }
    .results h2 { font-size: 1rem; font-weight: 600; margin-bottom: 16px; color: var(--nxb-color-text-secondary); }
    .agent-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .agent-card { background: var(--nxb-color-surface); border: 1px solid var(--nxb-color-border); border-radius: 10px; padding: 16px; }
    .agent-card h3 { font-size: 0.85rem; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .agent-card .badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
    .badge.pass { background: #dcfce7; color: #166534; }
    .badge.fail { background: #fee2e2; color: #991b1b; }
    .badge.intent { background: #e0e7ff; color: #3730a3; }
    .agent-card pre { font-size: 0.75rem; background: #f8fafc; border: 1px solid var(--nxb-color-border); border-radius: 6px; padding: 10px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; }
    .agent-card ul { font-size: 0.8rem; padding-left: 16px; }
    .agent-card li { margin-bottom: 4px; }

    .final-preview { background: var(--nxb-color-surface); border: 2px solid var(--nxb-color-accent); border-radius: 10px; padding: 20px; }
    .final-preview h3 { font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--nxb-color-accent); }
    .final-preview .email-text { font-size: 0.85rem; white-space: pre-wrap; line-height: 1.6; background: #fffbf5; padding: 16px; border-radius: 6px; border: 1px solid #fed7aa; }

    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #e2e8f0; border-top-color: var(--nxb-color-primary); border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .timing { font-size: 0.75rem; color: var(--nxb-color-text-muted); margin-top: 8px; }

    @media (max-width: 768px) {
      .agent-grid { grid-template-columns: 1fr; }
      .form-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoSvg}
      <h1>Email Simulator</h1>
      <a href="/dashboard">&larr; Back to Dashboard</a>
    </div>

    <div class="sim-form">
      <h2>Compose Test Email</h2>
      <form id="simForm" onsubmit="runSimulation(event)">
        <div class="form-row">
          <div class="form-group">
            <label>From Name</label>
            <input type="text" id="fromName" value="Jane Smith" required />
          </div>
          <div class="form-group">
            <label>From Email</label>
            <input type="email" id="fromEmail" value="jane@example.com" required />
          </div>
        </div>
        <div class="form-row full">
          <div class="form-group">
            <label>Subject</label>
            <input type="text" id="subject" value="Quick sync this week?" required />
          </div>
        </div>
        <div class="form-row full">
          <div class="form-group">
            <label>Email Body</label>
            <textarea id="emailBody" required>Hey! Would love to grab 30 minutes with you sometime this week to chat about the project. I'm free most afternoons. Let me know what works!</textarea>
          </div>
        </div>
        <button type="submit" class="btn-run" id="runBtn">Run Through Pipeline</button>
        <span id="status" style="margin-left: 12px; font-size: 0.85rem; color: var(--nxb-color-text-secondary);"></span>
      </form>
    </div>

    <div class="results" id="results">
      <h2>Pipeline Results</h2>

      <div class="agent-grid">
        <div class="agent-card" id="agent1Card">
          <h3>Agent 1: Extractor</h3>
          <pre id="agent1Output">—</pre>
          <div class="timing" id="agent1Time"></div>
        </div>
        <div class="agent-card" id="agent2Card">
          <h3>Agent 2: Composer</h3>
          <pre id="agent2Output">—</pre>
          <div class="timing" id="agent2Time"></div>
        </div>
        <div class="agent-card" id="agent3Card">
          <h3>Agent 3: QC <span class="badge" id="qcBadge" style="display:none;"></span></h3>
          <div id="agent3Output"></div>
          <div class="timing" id="agent3Time"></div>
        </div>
      </div>

      <div class="final-preview">
        <h3>Final Email Preview</h3>
        <div class="email-text" id="finalEmail">—</div>
      </div>
    </div>
  </div>

  <script>
    async function runSimulation(e) {
      e.preventDefault();
      const btn = document.getElementById('runBtn');
      const status = document.getElementById('status');
      btn.disabled = true;
      status.innerHTML = '<span class="spinner"></span> Running 3-agent pipeline...';

      document.getElementById('results').classList.add('visible');
      document.getElementById('agent1Output').textContent = 'Running...';
      document.getElementById('agent2Output').textContent = 'Waiting...';
      document.getElementById('agent3Output').innerHTML = '<pre>Waiting...</pre>';
      document.getElementById('finalEmail').textContent = 'Waiting...';
      document.getElementById('qcBadge').style.display = 'none';

      try {
        const res = await fetch('/simulator/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromName: document.getElementById('fromName').value,
            fromEmail: document.getElementById('fromEmail').value,
            subject: document.getElementById('subject').value,
            emailBody: document.getElementById('emailBody').value,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          status.textContent = 'Error: ' + (data.error || 'Unknown error');
          btn.disabled = false;
          return;
        }

        // Agent 1 results
        document.getElementById('agent1Output').textContent = JSON.stringify(data.extracted, null, 2);
        document.getElementById('agent1Time').textContent = data.timing?.extract || '';

        // Agent 2 results
        document.getElementById('agent2Output').textContent = data.composedText || '—';
        document.getElementById('agent2Time').textContent = data.timing?.compose || '';

        // Agent 3 results
        const qc = data.qcResult;
        const badge = document.getElementById('qcBadge');
        badge.style.display = 'inline';
        badge.className = 'badge ' + (qc.verdict === 'pass' ? 'pass' : 'fail');
        badge.textContent = qc.verdict.toUpperCase();

        let qcHtml = '';
        if (qc.issues?.length) {
          qcHtml += '<p style="font-size:0.8rem;font-weight:500;margin-bottom:4px;">Issues:</p><ul>' + qc.issues.map(i => '<li>' + i + '</li>').join('') + '</ul>';
        }
        if (qc.questions?.length) {
          qcHtml += '<p style="font-size:0.8rem;font-weight:500;margin:8px 0 4px;">Questions:</p><ul>' + qc.questions.map(q => '<li>' + q + '</li>').join('') + '</ul>';
        }
        if (qc.suggestions?.length) {
          qcHtml += '<p style="font-size:0.8rem;font-weight:500;margin:8px 0 4px;">Suggestions:</p><ul>' + qc.suggestions.map(s => '<li>' + s + '</li>').join('') + '</ul>';
        }
        if (!qcHtml) qcHtml = '<p style="font-size:0.8rem;color:#059669;">No issues found.</p>';
        document.getElementById('agent3Output').innerHTML = qcHtml;
        document.getElementById('agent3Time').textContent = data.timing?.qc || '';

        // Final email
        document.getElementById('finalEmail').textContent = data.composedText || '—';

        status.textContent = 'Pipeline complete (' + (data.timing?.total || '?') + ')';
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
      }

      btn.disabled = false;
    }
  </script>
</body>
</html>`);
});

/**
 * Run the full 3-agent pipeline on a simulated email.
 * No real calendar events are created, no real emails are sent.
 */
simulatorRoutes.post("/run", async (c) => {
  const body = await c.req.json<{
    fromName: string;
    fromEmail: string;
    subject: string;
    emailBody: string;
  }>();

  // Get the organizer (first user)
  const organizer = await db.query.users.findFirst();
  if (!organizer) return c.json({ error: "No user configured" }, 500);

  const tz = organizer.timezone || "America/New_York";
  const timing: Record<string, string> = {};
  const totalStart = Date.now();

  try {
    // ── Agent 1: Extract ──────────────────────────────────
    const extractStart = Date.now();

    // Build minimal context for extraction (no real meeting)
    const userTypes = await db.query.meetingTypes.findMany({
      where: eq(meetingTypes.userId, organizer.id),
    });
    const rules = await db.query.availabilityRules.findMany({
      where: eq(availabilityRules.userId, organizer.id),
    });
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const availPref = rules
      .filter((r) => r.isActive)
      .map((r) => `${days[r.dayOfWeek]}: ${r.startTime} - ${r.endTime}`)
      .join(", ");

    const extracted = await extractIntent(
      body.emailBody,
      body.fromEmail,
      body.fromName,
      body.subject,
      {
        organizerName: organizer.name,
        organizerEmail: organizer.email,
        organizerTimezone: tz,
        meetingStatus: "new request",
        availabilityPreferences: availPref || undefined,
        userMeetingTypes: userTypes.map((t) => ({
          id: t.id,
          name: t.name,
          isOnline: t.isOnline,
          defaultDuration: t.defaultDuration,
        })),
      },
    );

    timing.extract = `${Date.now() - extractStart}ms`;

    // ── Build simulated ComposerContext ──────────────────
    // For the simulator, we build a simple context without real calendar ops
    const participantNames = [body.fromName || body.fromEmail.split("@")[0]];
    const composerCtx = {
      intent: extracted.intent,
      meetingTitle: extracted.meeting_details.title ?? `Meeting with ${body.fromName}`,
      organizerName: organizer.name,
      participantNames,
      senderName: body.fromName,
      // In sim mode we provide sample slots for schedule_new intent
      ...(extracted.intent === "schedule_new" ? {
        formattedSlots: "1. Wednesday, April 9 at 2:00 PM - 2:30 PM\n2. Thursday, April 10 at 10:00 AM - 10:30 AM\n3. Friday, April 11 at 3:00 PM - 3:30 PM",
        pickerLink: `${env.APP_URL}/meeting/sim-test`,
      } : {}),
      ...(extracted.intent === "confirm_time" ? {
        confirmedTime: "Wednesday, April 9 at 2:00 PM",
        rescheduleLink: `${env.APP_URL}/meeting/sim-test`,
      } : {}),
      originalEmailSummary: extracted.meeting_context_summary,
    };

    // ── Agent 2: Compose ──────────────────────────────────
    const composeStart = Date.now();
    const composedText = await composeEmail(extracted, composerCtx, "");
    timing.compose = `${Date.now() - composeStart}ms`;

    // ── Agent 3: QC ───────────────────────────────────────
    const qcStart = Date.now();
    const qcResult = await reviewEmail(composedText, "", extracted, composerCtx);
    timing.qc = `${Date.now() - qcStart}ms`;
    timing.total = `${Date.now() - totalStart}ms`;

    return c.json({
      extracted,
      composerContext: composerCtx,
      composedText,
      qcResult,
      timing,
    });
  } catch (err) {
    console.error("Simulator error:", err);
    return c.json({
      error: err instanceof Error ? err.message : "Unknown error",
      timing: { total: `${Date.now() - totalStart}ms` },
    }, 500);
  }
});
