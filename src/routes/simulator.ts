import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, emailThreads, emailMessages, participants, users, meetingTypes, availabilityRules, proposedSlots } from "../db/schema.js";
import { extractIntent, runComposeQCLoop } from "../services/ai-pipeline.js";
import type { PipelineResult } from "../services/ai-pipeline.js";
import { formatSlot } from "../services/intent-handlers.js";
import type { ComposerContext, TimePreference } from "../types/index.js";
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
    .msg.organizer { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .msg.inbound { background: #f0f4f8; border: 1px solid #e2e8f0; }
    .msg.outbound { background: #fffbf5; border: 1px solid #fed7aa; }
    .msg-header { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.75rem; color: var(--nxb-color-text-secondary); }
    .msg-from { font-weight: 600; }
    .msg-label { font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; font-weight: 500; }
    .msg-label.org { background: #dcfce7; color: #166534; }
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
    .form-group input[readonly] { background: #f8fafc; color: var(--nxb-color-text-secondary); }
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
          <!-- Start form: P.J. writes the initial email -->
          <div id="startForm" class="start-form">
            <p style="font-size:0.85rem; color: var(--nxb-color-text-secondary); margin-bottom: 14px;">Write as ${user.name} (you). CC Luca on an email to someone you want to meet with.</p>
            <div class="form-row">
              <div class="form-group">
                <label>From (you)</label>
                <input type="text" id="fromOrganizer" value="${user.name} <${user.email}>" readonly />
              </div>
              <div class="form-group">
                <label>CC</label>
                <input type="text" value="Luca <luca@${env.MAILGUN_DOMAIN}>" readonly />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Recipient Name</label>
                <input type="text" id="recipientName" value="Jane Smith" />
              </div>
              <div class="form-group">
                <label>Recipient Email</label>
                <input type="email" id="recipientEmail" value="jane@example.com" />
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Subject</label>
                <input type="text" id="subject" value="Catching up" />
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Email Body</label>
                <textarea id="startBody">Hey Jane, would love to grab coffee sometime this week or next. I've copied Luca to help us find a time that works.</textarea>
              </div>
            </div>
            <button class="btn btn-primary" onclick="startConversation()">Send as ${user.name.split(/\\s+/)[0]}</button>
            <span id="startStatus" style="margin-left: 10px; font-size: 0.82rem; color: var(--nxb-color-text-secondary);"></span>
          </div>
        </div>

        <!-- Reply compose (hidden until conversation starts) -->
        <div class="compose-area" id="composeArea" style="display: none;">
          <textarea id="replyBody" placeholder="Type a reply..."></textarea>
          <div class="compose-controls">
            <button class="btn btn-primary" id="replyBtn" onclick="sendReply()">Reply as <span id="replyAsName">recipient</span></button>
            <button class="btn" style="background: var(--nxb-color-surface); border: 1px solid var(--nxb-color-border);" onclick="copyContext()">Copy Context</button>
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
    let recipientName = '';
    let recipientEmail = '';
    let organizerName = '${user.name}';
    let organizerEmail = '${user.email}';
    let subject = '';
    let lucaEmail = 'luca@${env.MAILGUN_DOMAIN}';

    // Full conversation log for copy-to-clipboard
    const conversationLog = [];

    function addMessage(msgFrom, msgTo, msgCc, body, type) {
      const messages = document.getElementById('threadMessages');
      const div = document.createElement('div');
      div.className = 'msg ' + type;
      const labelMap = { organizer: 'org', inbound: 'in', outbound: 'out' };
      const textMap = { organizer: '${user.name.split(/\s+/)[0].toUpperCase()}', inbound: 'THEM', outbound: 'LUCA' };
      const label = labelMap[type] || 'in';
      const labelText = textMap[type] || type.toUpperCase();
      let headerHtml =
        '<div class="msg-header">' +
          '<span class="msg-from"><b>From:</b> ' + escapeHtml(msgFrom) + '</span>' +
          '<span class="msg-label ' + label + '">' + labelText + '</span>' +
        '</div>' +
        '<div style="font-size:0.73rem; color: var(--nxb-color-text-muted); margin-bottom: 6px;"><b>To:</b> ' + escapeHtml(msgTo) +
        (msgCc ? ' &nbsp;<b>CC:</b> ' + escapeHtml(msgCc) : '') +
        '</div>';
      div.innerHTML = headerHtml + '<div class="msg-body">' + escapeHtml(body) + '</div>';
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
      const title = data.composerContext?.meetingTitle || 'Meeting';
      const code = 'SIM1';

      if (passed) {
        notifText.textContent =
          'Luca drafted a reply for "' + title + '" to ' + recipientEmail + ':\\n\\n---\\n' +
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
      recipientName = document.getElementById('recipientName').value;
      recipientEmail = document.getElementById('recipientEmail').value;
      subject = document.getElementById('subject').value;
      const body = document.getElementById('startBody').value;

      const startStatus = document.getElementById('startStatus');
      startStatus.innerHTML = '<span class="spinner"></span> Running pipeline...';

      try {
        const res = await fetch('/simulator/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientName, recipientEmail, subject, emailBody: body }),
        });
        const data = await res.json();
        if (!res.ok) { startStatus.textContent = 'Error: ' + (data.error || 'Unknown'); return; }

        sessionId = data.sessionId;
        lucaEmail = data.lucaEmail || lucaEmail;

        // Remove start form, show conversation
        document.getElementById('startForm').remove();
        document.getElementById('threadSubject').textContent = subject;
        document.getElementById('composeArea').style.display = 'block';
        document.getElementById('replyAsName').textContent = recipientName.split(' ')[0];
        document.getElementById('replyBody').placeholder = 'Type a reply as ' + recipientName + '...';

        // Show P.J.'s initial email (organizer → recipient, cc Luca)
        var orgAddr = organizerName + ' <' + organizerEmail + '>';
        var recipAddr = recipientName + ' <' + recipientEmail + '>';
        var lucaAddr = 'Luca <' + lucaEmail + '>';
        addMessage(orgAddr, recipAddr, lucaAddr, body, 'organizer');

        // Show Luca's response to the recipient (bcc organizer)
        addMessage(lucaAddr, recipAddr, '', data.composedText, 'outbound');

        // Log for copy context
        conversationLog.push({
          turn: 1,
          type: 'organizer',
          from: orgAddr,
          to: recipAddr,
          cc: lucaAddr,
          body: body,
        });
        conversationLog.push({
          turn: 1,
          type: 'luca_response',
          from: lucaAddr,
          to: recipAddr,
          body: data.composedText,
          extracted: data.extracted,
          composerContext: data.composerContext,
          pipeline: data.pipeline,
          timing: data.timing,
        });

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

      // Show the recipient's reply
      var recipAddr = recipientName + ' <' + recipientEmail + '>';
      var lucaAddr = 'Luca <' + lucaEmail + '>';
      addMessage(recipAddr, lucaAddr, '', body, 'inbound');
      document.getElementById('replyBody').value = '';

      try {
        const res = await fetch('/simulator/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, emailBody: body }),
        });
        const data = await res.json();
        if (!res.ok) { status.textContent = 'Error: ' + (data.error || 'Unknown'); btn.disabled = false; return; }

        // Luca replies to the recipient
        addMessage(lucaAddr, recipAddr, '', data.composedText, 'outbound');

        // Log for copy context
        var turnNum = Math.floor(conversationLog.length / 2) + 1;
        conversationLog.push({
          turn: turnNum,
          type: 'recipient_reply',
          from: recipAddr,
          to: lucaAddr,
          body: body,
        });
        conversationLog.push({
          turn: turnNum,
          type: 'luca_response',
          from: lucaAddr,
          to: recipAddr,
          body: data.composedText,
          extracted: data.extracted,
          composerContext: data.composerContext,
          pipeline: data.pipeline,
          timing: data.timing,
        });

        updateInspector(data);
        status.textContent = data.timing?.total || '';
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
      }

      btn.disabled = false;
    }

    function copyContext() {
      var lines = [];
      lines.push('# Simulator Session');
      lines.push('Subject: ' + subject);
      lines.push('Organizer: ' + organizerName + ' <' + organizerEmail + '>');
      lines.push('Recipient: ' + recipientName + ' <' + recipientEmail + '>');
      lines.push('');

      conversationLog.forEach(function(entry) {
        lines.push('---');
        if (entry.type === 'organizer') {
          lines.push('## ' + organizerName + ' → ' + recipientName + ' (CC Luca)');
          lines.push(entry.body);
        } else if (entry.type === 'recipient_reply') {
          lines.push('## ' + recipientName + ' → Luca');
          lines.push(entry.body);
        } else if (entry.type === 'luca_response') {
          lines.push('## Luca → ' + recipientName);
          lines.push(entry.body);
          lines.push('');
          lines.push('### Extractor Output');
          lines.push('\`\`\`json');
          lines.push(JSON.stringify(entry.extracted, null, 2));
          lines.push('\`\`\`');
          lines.push('');
          lines.push('### Composer Context');
          lines.push('\`\`\`json');
          lines.push(JSON.stringify(entry.composerContext, null, 2));
          lines.push('\`\`\`');
          if (entry.pipeline) {
            var p = entry.pipeline;
            lines.push('');
            lines.push('### Pipeline (' + (p.attempts || []).length + ' attempt(s), ' + (p.passed ? 'PASSED' : 'FAILED') + ')');
            (p.attempts || []).forEach(function(a) {
              lines.push('');
              lines.push('**Attempt ' + a.attempt + '** — QC: ' + a.qcResult.verdict);
              if (a.qcResult.issues && a.qcResult.issues.length) lines.push('Issues: ' + a.qcResult.issues.join('; '));
              if (a.qcResult.suggestions && a.qcResult.suggestions.length) lines.push('Suggestions: ' + a.qcResult.suggestions.join('; '));
              if (a.qcResult.questions && a.qcResult.questions.length) lines.push('Questions: ' + a.qcResult.questions.join('; '));
              lines.push('Draft:');
              lines.push(a.composedText);
            });
          }
          if (entry.timing) {
            lines.push('');
            lines.push('### Timing');
            lines.push(JSON.stringify(entry.timing));
          }
        }
        lines.push('');
      });

      var text = lines.join(String.fromCharCode(10));
      navigator.clipboard.writeText(text).then(function() {
        var status = document.getElementById('replyStatus');
        status.textContent = 'Copied!';
        setTimeout(function() { status.textContent = ''; }, 2000);
      });
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
  organizerEmail: string;
  tz: string;
  recipientName: string;
  recipientEmail: string;
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
 * Start a new simulated conversation.
 * P.J. (organizer) sends the first email to a recipient, CC'ing Luca.
 * Luca then responds directly to the recipient with time proposals.
 */
simulatorRoutes.post("/run", async (c) => {
  const body = await c.req.json<{
    recipientName: string;
    recipientEmail: string;
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

    // The sender is the ORGANIZER (P.J.) — this triggers the "sender IS the organizer"
    // path in the extractor, which correctly identifies this as a scheduling request
    // from the organizer to the recipient.
    const extracted = await extractIntent(
      body.emailBody,
      organizer.email,
      organizer.name,
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

    // Resolve meeting type constraints for slot generation
    const typeIds = extracted.meeting_details.meeting_type_ids
      ?? (extracted.meeting_details.meeting_type_id ? [extracted.meeting_details.meeting_type_id] : []);
    const resolvedTypes = typeIds.length > 0
      ? userTypes.filter((t) => typeIds.includes(t.id))
      : [];

    // Build simulated ComposerContext — Luca writes TO the recipient
    const simSlots = generateSimSlots(tz, extracted.time_preferences, resolvedTypes);
    const composerCtx = buildSimComposerContext(extracted.intent, {
      meetingTitle: extracted.meeting_details.title ?? `Meeting with ${body.recipientName}`,
      organizerName: organizer.name,
      participantNames: [body.recipientName || body.recipientEmail.split("@")[0]],
      senderName: body.recipientName,
      formattedSlots: simSlots.formatted,
      slotTypeLabels: simSlots.typeLabels,
      originalEmailSummary: extracted.meeting_context_summary,
    });

    // Thread history starts with P.J.'s initial email
    const threadHistoryStr = `[inbound] From: ${organizer.name} <${organizer.email}>\nTo: ${body.recipientName} <${body.recipientEmail}>\nCC: Luca\n${body.emailBody}`;

    // Agents 2+3: Compose → QC loop (up to 3 attempts)
    const loopStart = Date.now();
    const pipelineResult = await runComposeQCLoop(extracted, composerCtx, threadHistoryStr);
    timing.composeQCLoop = `${Date.now() - loopStart}ms`;
    timing.total = `${Date.now() - totalStart}ms`;

    // Create session for follow-up replies
    const sessionId = nanoid(10);
    simSessions.set(sessionId, {
      organizerId: organizer.id,
      organizerName: organizer.name,
      organizerEmail: organizer.email,
      tz,
      recipientName: body.recipientName,
      recipientEmail: body.recipientEmail,
      subject: body.subject,
      threadHistory: [
        `[inbound] From: ${organizer.name} <${organizer.email}>\nTo: ${body.recipientName} <${body.recipientEmail}>\nCC: Luca\n${body.emailBody}`,
        `[outbound] From: Luca\nTo: ${body.recipientName} <${body.recipientEmail}>\n${pipelineResult.finalText}`,
      ],
      lastLucaResponse: pipelineResult.finalText,
      proposedSlots: simSlots.raw,
      meetingStatus: extracted.intent === "schedule_new" ? "proposed" : "draft",
    });

    return c.json({
      sessionId,
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
 * The user plays the RECIPIENT — their replies go to Luca, who responds.
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
    // Add the recipient's reply to thread history
    session.threadHistory.push(`[inbound] From: ${session.recipientName} <${session.recipientEmail}>\n${body.emailBody}`);
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

    // Agent 1: Extract — sender is now the RECIPIENT (not the organizer)
    const extractStart = Date.now();
    const extracted = await extractIntent(
      body.emailBody,
      session.recipientEmail,
      session.recipientName,
      session.subject,
      {
        organizerName: session.organizerName,
        organizerEmail: session.organizerEmail,
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

    // Resolve meeting type constraints for slot generation
    const typeIds = extracted.meeting_details.meeting_type_ids
      ?? (extracted.meeting_details.meeting_type_id ? [extracted.meeting_details.meeting_type_id] : []);
    const resolvedTypes = typeIds.length > 0
      ? userTypes.filter((t) => typeIds.includes(t.id))
      : [];

    // Build context based on detected intent
    let replySlots: { formatted: string; raw: string[]; typeLabels?: string[] } | undefined;
    if (extracted.intent === "reschedule" || extracted.intent === "ask_for_more_times") {
      replySlots = generateSimSlots(session.tz, extracted.time_preferences, resolvedTypes);
    }

    const composerCtx = buildSimComposerContext(extracted.intent, {
      meetingTitle: `Meeting with ${session.recipientName}`,
      organizerName: session.organizerName,
      participantNames: [session.recipientName || session.recipientEmail.split("@")[0]],
      senderName: session.recipientName,
      formattedSlots: replySlots?.formatted,
      slotTypeLabels: replySlots?.typeLabels,
      proposedSlots: session.proposedSlots,
      originalEmailSummary: extracted.meeting_context_summary,
    });

    // Update meeting status based on intent
    if (extracted.intent === "confirm_time") {
      session.meetingStatus = "confirmed";
    } else if (extracted.intent === "reschedule" || extracted.intent === "ask_for_more_times") {
      session.meetingStatus = "proposed";
      session.proposedSlots = replySlots?.raw ?? generateSimSlots(session.tz, extracted.time_preferences, resolvedTypes).raw;
    } else if (extracted.intent === "decline") {
      session.meetingStatus = "cancelled";
    }

    // Agents 2+3: Compose → QC loop (up to 3 attempts)
    const loopStart = Date.now();
    const pipelineResult = await runComposeQCLoop(extracted, composerCtx, threadHistoryStr);
    timing.composeQCLoop = `${Date.now() - loopStart}ms`;
    timing.total = `${Date.now() - totalStart}ms`;

    // Update session
    session.threadHistory.push(`[outbound] From: Luca\nTo: ${session.recipientName} <${session.recipientEmail}>\n${pipelineResult.finalText}`);
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

/**
 * Convert a local date/time in a given timezone to a UTC Date.
 * Mirrors the same function in slot-proposer.ts.
 */
function localTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const rough = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  const utcStr = rough.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = rough.toLocaleString("en-US", { timeZone: tz });
  const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
  return new Date(rough.getTime() - offsetMs);
}

/**
 * Get the local date components for a UTC date in a given timezone.
 */
function getLocalDateParts(utcDate: Date, tz: string): { year: number; month: number; day: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(utcDate);

  const year = parseInt(parts.find(p => p.type === "year")!.value);
  const month = parseInt(parts.find(p => p.type === "month")!.value) - 1;
  const day = parseInt(parts.find(p => p.type === "day")!.value);
  const weekday = parts.find(p => p.type === "weekday")!.value;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return { year, month, day, dayOfWeek: dowMap[weekday] ?? 0 };
}

interface MeetingTypeConstraint {
  id: string;
  name: string;
  defaultDuration: number;
  earliestTime: string | null;
  latestTime: string | null;
  allowedDays: number[] | null;
}

/** Generate realistic simulated time slots that respect extracted time preferences and meeting type constraints. */
function generateSimSlots(
  tz: string,
  timePreferences?: TimePreference[],
  meetingTypes?: MeetingTypeConstraint[],
): { formatted: string; raw: string[]; typeLabels?: string[] } {
  const now = new Date();
  const prefs = timePreferences ?? [];
  const types = meetingTypes ?? [];
  const hasMultipleTypes = types.length > 1;

  // Build type-specific time windows (or use defaults if no types)
  const typeWindows = types.length > 0
    ? types.map((t) => ({
        id: t.id,
        name: t.name,
        duration: t.defaultDuration,
        earliest: t.earliestTime ? parseTimeToMinutes(t.earliestTime) : 9 * 60,
        latest: t.latestTime ? parseTimeToMinutes(t.latestTime) : 17 * 60,
        allowedDays: t.allowedDays ?? [1, 2, 3, 4, 5],
      }))
    : [{ id: "", name: "", duration: 30, earliest: 9 * 60, latest: 17 * 60, allowedDays: [1, 2, 3, 4, 5] }];

  // Generate candidate slots across 14 days
  const candidates: { start: Date; end: Date; score: number; typeName: string }[] = [];

  const todayParts = getLocalDateParts(now, tz);
  const tomorrowBase = new Date(todayParts.year, todayParts.month, todayParts.day + 1);

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const localDate = new Date(tomorrowBase);
    localDate.setDate(localDate.getDate() + dayOffset);

    const year = localDate.getFullYear();
    const month = localDate.getMonth();
    const day = localDate.getDate();

    const dayStartUtc = localTimeToUtc(year, month, day, 9, 0, tz);
    const { dayOfWeek } = getLocalDateParts(dayStartUtc, tz);

    for (const tw of typeWindows) {
      // Check if this day is allowed for this type
      if (!tw.allowedDays.includes(dayOfWeek)) continue;

      // Generate hourly slots within the type's time window
      const startHour = Math.floor(tw.earliest / 60);
      const endHour = Math.floor(tw.latest / 60);
      const durationMs = tw.duration * 60 * 1000;

      for (let h = startHour; h < endHour; h++) {
        const start = localTimeToUtc(year, month, day, h, 0, tz);
        const end = new Date(start.getTime() + durationMs);

        if (start <= now) continue;

        // Check end time doesn't exceed latest
        const endMinutes = h * 60 + tw.duration;
        if (endMinutes > tw.latest) continue;

        let score = 100;

        for (const pref of prefs) {
          if (pref.start && pref.end) {
            const prefStart = new Date(pref.start);
            const prefEnd = new Date(pref.end);
            const overlaps = start < prefEnd && end > prefStart;
            if (pref.type === "prefer" && overlaps) score += 50;
            if (pref.type === "available" && overlaps) score += 30;
            if (pref.type === "avoid" && overlaps) score -= 100;
            if (pref.type === "unavailable" && overlaps) score -= 200;
          }

          if (pref.dayOfWeek !== undefined && !pref.start) {
            if (pref.type === "prefer" && dayOfWeek === pref.dayOfWeek) score += 40;
            if (pref.type === "available" && dayOfWeek === pref.dayOfWeek) score += 25;
            if (pref.type === "avoid" && dayOfWeek === pref.dayOfWeek) score -= 80;
            if (pref.type === "unavailable" && dayOfWeek === pref.dayOfWeek) score -= 150;
          }

          if (pref.timeOfDayStart && pref.timeOfDayEnd && !pref.start) {
            const [sh, sm] = pref.timeOfDayStart.split(":").map(Number);
            const [eh, em] = pref.timeOfDayEnd.split(":").map(Number);
            const slotMinutes = h * 60;
            const inRange = slotMinutes >= sh * 60 + sm && slotMinutes < eh * 60 + em;
            if (pref.type === "prefer" && inRange) score += 40;
            if (pref.type === "available" && inRange) score += 25;
            if (pref.type === "avoid" && inRange) score -= 100;
            if (pref.type === "unavailable" && inRange) score -= 200;
          }
        }

        if (h >= 10 && h <= 14) score += 5;
        score += Math.max(0, 3 - Math.floor(dayOffset / 2));

        candidates.push({ start, end, score, typeName: tw.name });
      }
    }
  }

  // Hard-filter: remove slots with negative scores
  let viable = candidates.filter(c => c.score > 0);
  if (viable.length === 0) viable = candidates;

  viable.sort((a, b) => b.score - a.score);

  // Pick top 3, spreading across days and types for diversity
  const picked: { start: Date; end: Date; typeName: string }[] = [];
  const usedDays = new Set<string>();
  const usedTypes = new Set<string>();

  // First pass: prioritize diversity across days AND types
  for (const slot of viable) {
    if (picked.length >= 3) break;
    const dateKey = slot.start.toLocaleDateString("en-US", { timeZone: tz });
    const isNewDay = !usedDays.has(dateKey);
    const isNewType = hasMultipleTypes && !usedTypes.has(slot.typeName);

    if (isNewDay || isNewType || picked.length >= 2) {
      picked.push({ start: slot.start, end: slot.end, typeName: slot.typeName });
      usedDays.add(dateKey);
      usedTypes.add(slot.typeName);
    }
  }

  // Backfill if needed
  if (picked.length < 3) {
    for (const slot of viable) {
      if (picked.length >= 3) break;
      if (!picked.some(p => p.start.getTime() === slot.start.getTime())) {
        picked.push({ start: slot.start, end: slot.end, typeName: slot.typeName });
      }
    }
  }

  // Build labels only when slots come from multiple types
  const distinctTypes = new Set(picked.map(p => p.typeName).filter(Boolean));
  const showLabels = distinctTypes.size > 1;

  const formatted = picked
    .map((s, i) => {
      const label = showLabels && s.typeName ? ` (${s.typeName.toLowerCase()})` : "";
      return `${i + 1}. ${formatSlot(s.start, s.end, tz)}${label}`;
    })
    .join("\n");

  const raw = picked.map((s) => formatSlot(s.start, s.end, tz));
  const typeLabels = showLabels ? picked.map(p => p.typeName) : undefined;

  return { formatted, raw, typeLabels };
}

/** Parse "HH:MM" time string to minutes since midnight. */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
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
    slotTypeLabels?: string[];
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
    ...(opts.slotTypeLabels ? { slotTypeLabels: opts.slotTypeLabels } : {}),
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
