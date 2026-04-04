import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, emailThreads, emailMessages, participants, users, meetingTypes, availabilityRules, proposedSlots } from "../db/schema.js";
import { extractIntent, runComposeQCLoop } from "../services/ai-pipeline.js";
import type { PipelineResult } from "../services/ai-pipeline.js";
import { formatSlot } from "../services/intent-handlers.js";
import type { ComposerContext } from "../types/index.js";
import { baseStyles, fontLinks, logoSvg } from "../lib/styles.js";
import { env } from "../config.js";
import { nanoid } from "nanoid";

export const simulatorRoutes = new Hono();

// ── Simulator Page ──────────────────────────────────────────────────────────

simulatorRoutes.get("/", async (c) => {
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
    .container { max-width: 1100px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 1.3rem; font-weight: 600; }
    .header a { color: var(--nxb-color-text-secondary); font-size: 0.85rem; text-decoration: none; margin-left: auto; }
    .header a:hover { color: var(--nxb-color-text); }

    .sim-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 800px) { .sim-layout { grid-template-columns: 1fr; } }

    /* Left: conversation thread */
    .thread-panel { background: var(--nxb-color-surface); border: 1px solid var(--nxb-color-border); border-radius: 10px; padding: 20px; min-height: 500px; display: flex; flex-direction: column; }
    .thread-panel h2 { font-size: 0.95rem; font-weight: 600; color: var(--nxb-color-text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .thread-messages { flex: 1; overflow-y: auto; margin-bottom: 16px; }
    .thread-empty { color: var(--nxb-color-text-muted); font-size: 0.85rem; text-align: center; padding: 40px 0; }

    .msg { margin-bottom: 12px; border-radius: 8px; padding: 12px; font-size: 0.85rem; }
    .msg.inbound { background: #f0f4f8; border: 1px solid #e2e8f0; }
    .msg.outbound { background: #fffbf5; border: 1px solid #fed7aa; }
    .msg-header { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.75rem; color: var(--nxb-color-text-secondary); }
    .msg-from { font-weight: 600; }
    .msg-label { font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; font-weight: 500; }
    .msg-label.in { background: #e0e7ff; color: #3730a3; }
    .msg-label.out { background: #fff7ed; color: #c2410c; }
    .msg-body { white-space: pre-wrap; line-height: 1.5; }

    /* Compose area at bottom of thread */
    .compose-area { border-top: 1px solid var(--nxb-color-border); padding-top: 12px; }
    .compose-area textarea { width: 100%; padding: 10px; border: 1px solid var(--nxb-color-border); border-radius: 6px; font-size: 0.85rem; min-height: 80px; resize: vertical; margin-bottom: 8px; }
    .compose-controls { display: flex; gap: 8px; align-items: center; }
    .btn { padding: 7px 16px; border-radius: 6px; font-weight: 500; font-size: 0.82rem; }
    .btn-primary { background: var(--nxb-color-primary); color: white; }
    .btn-primary:hover { background: var(--nxb-color-primary-hover); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-danger { background: white; color: var(--nxb-color-danger); border: 1px solid var(--nxb-color-danger); }
    .btn-danger:hover { background: #fef2f2; }
    .compose-status { font-size: 0.8rem; color: var(--nxb-color-text-secondary); margin-left: auto; }

    /* Right: pipeline inspector */
    .inspector-panel { display: flex; flex-direction: column; gap: 12px; }
    .inspector-panel h2 { font-size: 0.95rem; font-weight: 600; color: var(--nxb-color-text-secondary); margin-bottom: 4px; }
    .agent-card { background: var(--nxb-color-surface); border: 1px solid var(--nxb-color-border); border-radius: 10px; padding: 14px; }
    .agent-card h3 { font-size: 0.82rem; font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .agent-card pre { font-size: 0.72rem; background: #f8fafc; border: 1px solid var(--nxb-color-border); border-radius: 6px; padding: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; margin: 0; }
    .agent-card ul { font-size: 0.78rem; padding-left: 16px; margin: 0; }
    .agent-card li { margin-bottom: 3px; }
    .badge { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
    .badge.pass { background: #dcfce7; color: #166534; }
    .badge.fail { background: #fee2e2; color: #991b1b; }
    .badge.intent { background: #e0e7ff; color: #3730a3; }
    .timing { font-size: 0.7rem; color: var(--nxb-color-text-muted); margin-top: 4px; }
    .inspector-empty { color: var(--nxb-color-text-muted); font-size: 0.85rem; text-align: center; padding: 40px 0; }

    /* Start form (before conversation begins) */
    .start-form { padding: 16px 0; }
    .start-form .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
    .start-form .form-row.full { grid-template-columns: 1fr; }
    .form-group label { display: block; font-size: 0.78rem; font-weight: 500; color: var(--nxb-color-text-secondary); margin-bottom: 3px; }
    .form-group input, .form-group textarea { width: 100%; padding: 7px 10px; border: 1px solid var(--nxb-color-border); border-radius: 6px; font-size: 0.85rem; }
    .form-group textarea { min-height: 80px; resize: vertical; }

    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #e2e8f0; border-top-color: var(--nxb-color-primary); border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoSvg}
      <h1>Email Simulator</h1>
      <a href="/dashboard">&larr; Back to Dashboard</a>
    </div>

    <div class="sim-layout">
      <!-- Left: Conversation Thread -->
      <div class="thread-panel">
        <h2>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Conversation
          <span id="threadSubject" style="font-weight:400; color: var(--nxb-color-text-muted); font-size: 0.8rem;"></span>
        </h2>

        <div class="thread-messages" id="threadMessages">
          <!-- Start form shown initially -->
          <div id="startForm" class="start-form">
            <p style="font-size:0.85rem; color: var(--nxb-color-text-secondary); margin-bottom: 14px;">Start a simulated conversation. You play the role of the person emailing Luca.</p>
            <div class="form-row">
              <div class="form-group">
                <label>Your Name (simulated)</label>
                <input type="text" id="fromName" value="Jane Smith" />
              </div>
              <div class="form-group">
                <label>Your Email (simulated)</label>
                <input type="email" id="fromEmail" value="jane@example.com" />
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Subject</label>
                <input type="text" id="subject" value="Quick sync this week?" />
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Email Body</label>
                <textarea id="startBody">Hey! Would love to grab 30 minutes with you sometime this week to chat about the project. I'm free most afternoons. Let me know what works!</textarea>
              </div>
            </div>
            <button class="btn btn-primary" onclick="startConversation()">Start Conversation</button>
            <span id="startStatus" style="margin-left: 10px; font-size: 0.82rem; color: var(--nxb-color-text-secondary);"></span>
          </div>
        </div>

        <!-- Reply compose (hidden until conversation starts) -->
        <div class="compose-area" id="composeArea" style="display: none;">
          <textarea id="replyBody" placeholder="Type a reply as the simulated person..."></textarea>
          <div class="compose-controls">
            <button class="btn btn-primary" id="replyBtn" onclick="sendReply()">Send Reply</button>
            <button class="btn btn-danger" onclick="resetConversation()">New Conversation</button>
            <span class="compose-status" id="replyStatus"></span>
          </div>
        </div>
      </div>

      <!-- Right: Pipeline Inspector -->
      <div class="inspector-panel">
        <h2>Pipeline Inspector</h2>
        <div id="inspectorEmpty" class="inspector-empty">Send a message to see the pipeline output.</div>

        <div id="inspectorCards" style="display: none;">
          <div class="agent-card">
            <h3>Agent 1: Extractor <span class="badge intent" id="intentBadge" style="display:none;"></span></h3>
            <pre id="agent1Output">—</pre>
            <div class="timing" id="agent1Time"></div>
          </div>
          <div id="attemptsContainer"></div>
          <div class="agent-card" id="draftNotification" style="display: none; border-color: var(--nxb-color-accent);">
            <h3 style="color: var(--nxb-color-accent);">Draft Notification (iMessage to you)</h3>
            <pre id="draftNotificationText" style="background: #fffbf5; border-color: #fed7aa;"></pre>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Conversation state
    let sessionId = null;
    let fromName = '';
    let fromEmail = '';
    let subject = '';
    let organizerEmail = '';
    let lucaEmail = 'luca@tanzillo.ai';

    function addMessage(msgFrom, msgTo, body, direction) {
      const messages = document.getElementById('threadMessages');
      const div = document.createElement('div');
      div.className = 'msg ' + direction;
      const label = direction === 'inbound' ? 'in' : 'out';
      const labelText = direction === 'inbound' ? 'THEM' : 'LUCA';
      div.innerHTML =
        '<div class="msg-header">' +
          '<span class="msg-from"><b>From:</b> ' + escapeHtml(msgFrom) + '</span>' +
          '<span class="msg-label ' + label + '">' + labelText + '</span>' +
        '</div>' +
        '<div style="font-size:0.73rem; color: var(--nxb-color-text-muted); margin-bottom: 6px;"><b>To:</b> ' + escapeHtml(msgTo) + '</div>' +
        '<div class="msg-body">' + escapeHtml(body) + '</div>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function escapeHtml(text) {
      const d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    }

    function updateInspector(data) {
      document.getElementById('inspectorEmpty').style.display = 'none';
      document.getElementById('inspectorCards').style.display = 'flex';
      document.getElementById('inspectorCards').style.flexDirection = 'column';
      document.getElementById('inspectorCards').style.gap = '12px';

      // Agent 1: Extractor
      document.getElementById('agent1Output').textContent = JSON.stringify(data.extracted, null, 2);
      document.getElementById('agent1Time').textContent = data.timing?.extract || '';
      const intentBadge = document.getElementById('intentBadge');
      intentBadge.style.display = 'inline';
      intentBadge.textContent = data.extracted.intent;

      // Attempts (Compose → QC loop)
      const container = document.getElementById('attemptsContainer');
      container.innerHTML = '';
      const attempts = data.pipeline?.attempts || [];

      attempts.forEach(function(attempt) {
        const card = document.createElement('div');
        card.className = 'agent-card';
        const isPass = attempt.qcResult.verdict === 'pass';
        const badgeClass = isPass ? 'pass' : 'fail';
        const attemptLabel = attempts.length > 1 ? ' (attempt ' + attempt.attempt + '/' + attempts.length + ')' : '';

        let qcHtml = '';
        if (attempt.qcResult.issues?.length) {
          qcHtml += '<p style="font-size:0.75rem;font-weight:500;margin:6px 0 3px;">Issues:</p><ul style="font-size:0.75rem;">' + attempt.qcResult.issues.map(function(i) { return '<li>' + escapeHtml(i) + '</li>'; }).join('') + '</ul>';
        }
        if (attempt.qcResult.questions?.length) {
          qcHtml += '<p style="font-size:0.75rem;font-weight:500;margin:6px 0 3px;">Questions:</p><ul style="font-size:0.75rem;">' + attempt.qcResult.questions.map(function(q) { return '<li>' + escapeHtml(q) + '</li>'; }).join('') + '</ul>';
        }
        if (attempt.qcResult.suggestions?.length) {
          qcHtml += '<p style="font-size:0.75rem;font-weight:500;margin:6px 0 3px;">Suggestions:</p><ul style="font-size:0.75rem;">' + attempt.qcResult.suggestions.map(function(s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') + '</ul>';
        }
        if (isPass && !qcHtml) qcHtml = '<p style="font-size:0.75rem;color:#059669;">QC passed.</p>';

        card.innerHTML =
          '<h3>Compose + QC' + escapeHtml(attemptLabel) + ' <span class="badge ' + badgeClass + '">' + attempt.qcResult.verdict.toUpperCase() + '</span></h3>' +
          '<pre>' + escapeHtml(attempt.composedText) + '</pre>' +
          '<div class="timing">Compose: ' + (attempt.composeTiming || '') + ' | QC: ' + (attempt.qcTiming || '') + '</div>' +
          qcHtml;
        container.appendChild(card);
      });

      // Draft notification preview (what P.J. would see via iMessage)
      const notifCard = document.getElementById('draftNotification');
      const notifText = document.getElementById('draftNotificationText');
      notifCard.style.display = 'block';

      const pipeline = data.pipeline || {};
      const passed = pipeline.passed;
      const finalQC = pipeline.finalQC || {};
      const recipients = fromEmail || 'recipient';
      const title = data.composerContext?.meetingTitle || 'Meeting';
      const code = 'SIM1';

      if (passed) {
        notifText.textContent =
          'Luca drafted a reply for "' + title + '" to ' + recipients + ':\\n\\n---\\n' +
          (data.composedText || '').slice(0, 500) +
          '\\n---\\n\\nReply: "send ' + code + '" to approve\\nReply: "reject ' + code + '" to discard\\nReply: "edit ' + code + ': [your version]" to modify and send';
      } else {
        var issues = (finalQC.issues || []).map(function(i) { return '- ' + i; }).join('\\n');
        var questions = (finalQC.questions || []).map(function(q) { return '- ' + q; }).join('\\n');
        notifText.textContent =
          'Luca\\'s QC flagged issues with a draft for "' + title + '":\\n\\n' +
          (issues ? 'Issues:\\n' + issues + '\\n\\n' : '') +
          (questions ? 'Questions:\\n' + questions + '\\n\\n' : '') +
          '---\\n' + (data.composedText || '').slice(0, 500) +
          '\\n---\\n\\nReply: "send ' + code + '" to send anyway\\nReply: "reject ' + code + '" to discard';
      }
    }

    async function startConversation() {
      fromName = document.getElementById('fromName').value;
      fromEmail = document.getElementById('fromEmail').value;
      subject = document.getElementById('subject').value;
      const body = document.getElementById('startBody').value;

      const startStatus = document.getElementById('startStatus');
      startStatus.innerHTML = '<span class="spinner"></span> Running pipeline...';

      try {
        const res = await fetch('/simulator/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromName, fromEmail, subject, emailBody: body }),
        });
        const data = await res.json();
        if (!res.ok) { startStatus.textContent = 'Error: ' + (data.error || 'Unknown'); return; }

        sessionId = data.sessionId;
        organizerEmail = data.organizerEmail || '';
        lucaEmail = data.lucaEmail || 'luca@tanzillo.ai';

        // Remove start form, show conversation
        document.getElementById('startForm').remove();
        document.getElementById('threadSubject').textContent = subject;
        document.getElementById('composeArea').style.display = 'block';

        // Add messages: inbound is from person → to Luca (cc organizer), outbound is from Luca → to person (bcc organizer)
        var personAddr = fromName + ' <' + fromEmail + '>';
        var lucaAddr = 'Luca <' + lucaEmail + '>';
        var orgAddr = organizerEmail ? ' (cc: ' + organizerEmail + ')' : '';
        addMessage(personAddr, lucaAddr + orgAddr, body, 'inbound');
        addMessage(lucaAddr, personAddr + (organizerEmail ? ' (bcc: ' + organizerEmail + ')' : ''), data.composedText, 'outbound');

        updateInspector(data);
      } catch (err) {
        startStatus.textContent = 'Error: ' + err.message;
      }
    }

    async function sendReply() {
      const body = document.getElementById('replyBody').value.trim();
      if (!body) return;

      const btn = document.getElementById('replyBtn');
      const status = document.getElementById('replyStatus');
      btn.disabled = true;
      status.innerHTML = '<span class="spinner"></span> Running pipeline...';

      var personAddr = fromName + ' <' + fromEmail + '>';
      var lucaAddr = 'Luca <' + lucaEmail + '>';
      var orgBcc = organizerEmail ? ' (bcc: ' + organizerEmail + ')' : '';
      var orgCc = organizerEmail ? ' (cc: ' + organizerEmail + ')' : '';
      addMessage(personAddr, lucaAddr + orgCc, body, 'inbound');
      document.getElementById('replyBody').value = '';

      try {
        const res = await fetch('/simulator/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, emailBody: body }),
        });
        const data = await res.json();
        if (!res.ok) { status.textContent = 'Error: ' + (data.error || 'Unknown'); btn.disabled = false; return; }

        addMessage(lucaAddr, personAddr + orgBcc, data.composedText, 'outbound');
        updateInspector(data);
        status.textContent = data.timing?.total || '';
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
      }

      btn.disabled = false;
    }

    function resetConversation() {
      sessionId = null;
      window.location.reload();
    }

    // Enter key sends reply
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement === document.getElementById('replyBody')) {
        e.preventDefault();
        sendReply();
      }
    });
  </script>
</body>
</html>`);
});

// ── Simulator API ───────────────────────────────────────────────────────────

interface SimSession {
  organizerId: string;
  organizerName: string;
  tz: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  /** Thread history — accumulated across turns */
  threadHistory: string[];
  /** Last Luca response (for context) */
  lastLucaResponse: string;
  /** Simulated proposed times for follow-ups */
  proposedSlots: string[];
  /** Meeting status tracking */
  meetingStatus: string;
}

// In-memory session store (simulator only — not for production data)
const simSessions = new Map<string, SimSession>();

/**
 * Start a new simulated conversation (first email).
 */
simulatorRoutes.post("/run", async (c) => {
  const body = await c.req.json<{
    fromName: string;
    fromEmail: string;
    subject: string;
    emailBody: string;
  }>();

  const organizer = await db.query.users.findFirst();
  if (!organizer) return c.json({ error: "No user configured" }, 500);

  const tz = organizer.timezone || "America/New_York";
  const timing: Record<string, string> = {};
  const totalStart = Date.now();

  try {
    const extractStart = Date.now();

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

    // Build simulated ComposerContext with realistic slots
    const simSlots = generateSimSlots(tz);
    const composerCtx = buildSimComposerContext(extracted.intent, {
      meetingTitle: extracted.meeting_details.title ?? `Meeting with ${body.fromName}`,
      organizerName: organizer.name,
      participantNames: [body.fromName || body.fromEmail.split("@")[0]],
      senderName: body.fromName,
      formattedSlots: simSlots.formatted,
      originalEmailSummary: extracted.meeting_context_summary,
    });

    // Agents 2+3: Compose → QC loop (up to 3 attempts)
    const threadHistoryStr = `[inbound] From: ${body.fromName}\n${body.emailBody}`;
    const loopStart = Date.now();
    const pipelineResult = await runComposeQCLoop(extracted, composerCtx, threadHistoryStr);
    timing.composeQCLoop = `${Date.now() - loopStart}ms`;
    timing.total = `${Date.now() - totalStart}ms`;

    // Create session for follow-up replies
    const sessionId = nanoid(10);
    simSessions.set(sessionId, {
      organizerId: organizer.id,
      organizerName: organizer.name,
      tz,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
      subject: body.subject,
      threadHistory: [
        `[inbound] From: ${body.fromName}\n${body.emailBody}`,
        `[outbound] From: Luca\n${pipelineResult.finalText}`,
      ],
      lastLucaResponse: pipelineResult.finalText,
      proposedSlots: simSlots.raw,
      meetingStatus: extracted.intent === "schedule_new" ? "proposed" : "draft",
    });

    return c.json({
      sessionId,
      organizerEmail: (await db.query.users.findFirst({ where: eq(users.id, organizer.id) }))?.email ?? "",
      lucaEmail: `luca@${env.MAILGUN_DOMAIN}`,
      extracted,
      composerContext: composerCtx,
      composedText: pipelineResult.finalText,
      pipeline: pipelineResult,
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

/**
 * Send a follow-up reply in an existing simulated conversation.
 * This is where we test the back-and-forth.
 */
simulatorRoutes.post("/reply", async (c) => {
  const body = await c.req.json<{
    sessionId: string;
    emailBody: string;
  }>();

  const session = simSessions.get(body.sessionId);
  if (!session) return c.json({ error: "Session not found — start a new conversation" }, 404);

  const timing: Record<string, string> = {};
  const totalStart = Date.now();

  try {
    // Add the inbound reply to thread history
    session.threadHistory.push(`[inbound] From: ${session.fromName}\n${body.emailBody}`);
    const threadHistoryStr = session.threadHistory.join("\n---\n");

    // Fetch organizer context
    const userTypes = await db.query.meetingTypes.findMany({
      where: eq(meetingTypes.userId, session.organizerId),
    });
    const rules = await db.query.availabilityRules.findMany({
      where: eq(availabilityRules.userId, session.organizerId),
    });
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const availPref = rules
      .filter((r) => r.isActive)
      .map((r) => `${days[r.dayOfWeek]}: ${r.startTime} - ${r.endTime}`)
      .join(", ");

    // Agent 1: Extract with full thread context
    const extractStart = Date.now();
    const extracted = await extractIntent(
      body.emailBody,
      session.fromEmail,
      session.fromName,
      session.subject,
      {
        organizerName: session.organizerName,
        organizerEmail: (await db.query.users.findFirst({ where: eq(users.id, session.organizerId) }))?.email ?? "",
        organizerTimezone: session.tz,
        meetingStatus: session.meetingStatus,
        proposedTimes: session.proposedSlots,
        threadHistory: threadHistoryStr,
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

    // Build context based on detected intent
    const composerCtx = buildSimComposerContext(extracted.intent, {
      meetingTitle: `Meeting with ${session.fromName}`,
      organizerName: session.organizerName,
      participantNames: [session.fromName || session.fromEmail.split("@")[0]],
      senderName: session.fromName,
      formattedSlots: extracted.intent === "reschedule" || extracted.intent === "ask_for_more_times"
        ? generateSimSlots(session.tz).formatted
        : undefined,
      proposedSlots: session.proposedSlots,
      originalEmailSummary: extracted.meeting_context_summary,
    });

    // Update meeting status based on intent
    if (extracted.intent === "confirm_time") {
      session.meetingStatus = "confirmed";
    } else if (extracted.intent === "reschedule" || extracted.intent === "ask_for_more_times") {
      session.meetingStatus = "proposed";
      session.proposedSlots = generateSimSlots(session.tz).raw;
    } else if (extracted.intent === "decline") {
      session.meetingStatus = "cancelled";
    }

    // Agents 2+3: Compose → QC loop (up to 3 attempts)
    const loopStart = Date.now();
    const pipelineResult = await runComposeQCLoop(extracted, composerCtx, threadHistoryStr);
    timing.composeQCLoop = `${Date.now() - loopStart}ms`;
    timing.total = `${Date.now() - totalStart}ms`;

    // Update session
    session.threadHistory.push(`[outbound] From: Luca\n${pipelineResult.finalText}`);
    session.lastLucaResponse = pipelineResult.finalText;

    return c.json({
      extracted,
      composerContext: composerCtx,
      composedText: pipelineResult.finalText,
      pipeline: pipelineResult,
      timing,
    });
  } catch (err) {
    console.error("Simulator reply error:", err);
    return c.json({
      error: err instanceof Error ? err.message : "Unknown error",
      timing: { total: `${Date.now() - totalStart}ms` },
    }, 500);
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate realistic simulated time slots. */
function generateSimSlots(tz: string): { formatted: string; raw: string[] } {
  const now = new Date();
  const slots: { start: Date; end: Date }[] = [];

  // Generate 3 slots: tomorrow afternoon, day after morning, 3 days out afternoon
  for (let offset = 1; offset <= 3; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    // Skip weekends
    if (day.getDay() === 0) day.setDate(day.getDate() + 1);
    if (day.getDay() === 6) day.setDate(day.getDate() + 2);

    const hours = offset === 2 ? 10 : 14; // Mix morning and afternoon
    day.setHours(hours, 0, 0, 0);
    const end = new Date(day);
    end.setMinutes(end.getMinutes() + 30);
    slots.push({ start: day, end });
  }

  const formatted = slots
    .map((s, i) => `${i + 1}. ${formatSlot(s.start, s.end, tz)}`)
    .join("\n");

  const raw = slots.map(
    (s) => formatSlot(s.start, s.end, tz),
  );

  return { formatted, raw };
}

/** Build a ComposerContext appropriate for the intent in simulation mode. */
function buildSimComposerContext(
  intent: string,
  opts: {
    meetingTitle: string;
    organizerName: string;
    participantNames: string[];
    senderName: string;
    formattedSlots?: string;
    proposedSlots?: string[];
    originalEmailSummary?: string;
  },
): ComposerContext {
  const base: ComposerContext = {
    intent,
    meetingTitle: opts.meetingTitle,
    organizerName: opts.organizerName,
    participantNames: opts.participantNames,
    senderName: opts.senderName,
    originalEmailSummary: opts.originalEmailSummary,
  };

  switch (intent) {
    case "schedule_new":
      return {
        ...base,
        formattedSlots: opts.formattedSlots,
        pickerLink: `${env.APP_URL}/meeting/sim-test`,
      };
    case "confirm_time":
      return {
        ...base,
        // Use first proposed slot as the "confirmed" time
        confirmedTime: opts.proposedSlots?.[0] ?? "Wednesday at 2:00 PM",
        rescheduleLink: `${env.APP_URL}/meeting/sim-test`,
      };
    case "reschedule":
    case "ask_for_more_times":
    case "propose_alternatives":
      return {
        ...base,
        formattedSlots: opts.formattedSlots,
        pickerLink: `${env.APP_URL}/meeting/sim-test`,
      };
    case "decline":
      return base;
    case "freeform_question":
    case "unrelated":
    default:
      return base;
  }
}
