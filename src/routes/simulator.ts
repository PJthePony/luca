import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, emailThreads, emailMessages, participants, users, meetingTypes, availabilityRules } from "../db/schema.js";
import { extractIntent, runComposeQCLoop } from "../services/ai-pipeline.js";
import type { PipelineResult } from "../services/ai-pipeline.js";
import { formatSlot } from "../services/intent-handlers.js";
import { findAvailableSlots, findAvailableSlotsMultiType } from "../services/slot-proposer.js";
import type { ProposedSlot } from "../services/slot-proposer.js";
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
        if (!res.ok) {
          if (data.authError && data.reconnectUrl) {
            startStatus.innerHTML = 'Google Calendar connection expired. <a href="' + data.reconnectUrl + '" style="color: var(--nxb-color-primary); font-weight: 600;">Reconnect Google Calendar</a>';
          } else {
            startStatus.textContent = 'Error: ' + (data.error || 'Unknown');
          }
          return;
        }

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
        if (!res.ok) {
          if (data.authError && data.reconnectUrl) {
            status.innerHTML = 'Google Calendar expired. <a href="' + data.reconnectUrl + '" style="color: var(--nxb-color-primary); font-weight: 600;">Reconnect</a>';
          } else {
            status.textContent = 'Error: ' + (data.error || 'Unknown');
          }
          btn.disabled = false;
          return;
        }

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
  /** Organizer's original time preferences — carried across all turns */
  organizerPreferences: TimePreference[];
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

    // Use REAL availability from Google Calendar + meeting type constraints
    const typeIds = extracted.meeting_details.meeting_type_ids
      ?? (extracted.meeting_details.meeting_type_id ? [extracted.meeting_details.meeting_type_id] : []);

    // Resolve duration from meeting type (don't default to 30 — use the type's configured duration)
    const primaryType = typeIds.length > 0 ? userTypes.find((t) => t.id === typeIds[0]) : undefined;
    const duration = extracted.meeting_details.duration_minutes ?? primaryType?.defaultDuration ?? 30;

    const slotsStart = Date.now();
    let realSlots: ProposedSlot[];
    if (typeIds.length > 1) {
      realSlots = await findAvailableSlotsMultiType(
        organizer.id, null, typeIds, extracted.time_preferences ?? [], 14,
      );
    } else {
      realSlots = await findAvailableSlots(
        organizer.id, null, duration, extracted.time_preferences ?? [], 14, typeIds[0] ?? null,
      );
    }
    timing.slotSearch = `${Date.now() - slotsStart}ms`;

    // Format slots for the composer
    const slotResults = formatRealSlots(realSlots, tz);

    // Build ComposerContext — Luca writes TO the recipient
    const composerCtx = buildSimComposerContext(extracted.intent, {
      meetingTitle: extracted.meeting_details.title ?? `Meeting with ${body.recipientName}`,
      organizerName: organizer.name,
      participantNames: [body.recipientName || body.recipientEmail.split("@")[0]],
      senderName: body.recipientName,
      formattedSlots: slotResults.formatted,
      slotTypeLabels: slotResults.typeLabels,
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
      proposedSlots: slotResults.raw,
      meetingStatus: extracted.intent === "schedule_new" ? "proposed" : "draft",
      organizerPreferences: extracted.time_preferences ?? [],
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
    const { msg, isAuthError } = classifyError(err);
    return c.json({
      error: msg,
      authError: isAuthError,
      reconnectUrl: isAuthError ? `/auth/google?userId=${organizer.id}` : undefined,
      timing: { total: `${Date.now() - totalStart}ms` },
    }, isAuthError ? 401 : 500);
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

    // Use REAL availability for slot generation
    const typeIds = extracted.meeting_details.meeting_type_ids
      ?? (extracted.meeting_details.meeting_type_id ? [extracted.meeting_details.meeting_type_id] : []);
    const primaryType = typeIds.length > 0 ? userTypes.find((t) => t.id === typeIds[0]) : undefined;
    const duration = extracted.meeting_details.duration_minutes ?? primaryType?.defaultDuration ?? 30;

    // Merge organizer's original preferences with the recipient's new preferences
    const mergedPreferences = [
      ...session.organizerPreferences,
      ...(extracted.time_preferences ?? []),
    ];

    let replySlots: { formatted: string; raw: string[]; typeLabels?: string[] } | undefined;
    let preferencesMismatchNote: string | undefined;

    if (extracted.intent === "reschedule" || extracted.intent === "ask_for_more_times" || extracted.intent === "propose_alternatives") {
      const slotsStart = Date.now();
      let realSlots: ProposedSlot[];
      if (typeIds.length > 1) {
        realSlots = await findAvailableSlotsMultiType(
          session.organizerId, null, typeIds, mergedPreferences, 14,
        );
      } else {
        realSlots = await findAvailableSlots(
          session.organizerId, null, duration, mergedPreferences, 14, typeIds[0] ?? null,
        );
      }
      timing.slotSearch = `${Date.now() - slotsStart}ms`;
      replySlots = formatRealSlots(realSlots, session.tz);

      // Check if returned slots actually match the recipient's "prefer" preferences
      // If recipient asked for specific times and none of the slots overlap, flag it
      const recipientPrefers = (extracted.time_preferences ?? []).filter(p => p.type === "prefer");
      if (recipientPrefers.length > 0 && realSlots.length > 0) {
        const anyMatch = realSlots.slice(0, 3).some(slot => {
          return recipientPrefers.some(pref => {
            if (pref.start && pref.end) {
              const prefStart = new Date(pref.start);
              const prefEnd = new Date(pref.end);
              return slot.start < prefEnd && slot.end > prefStart;
            }
            return false;
          });
        });

        if (!anyMatch) {
          const wantedDesc = recipientPrefers.map(p => p.description).filter(Boolean).join(", ");

          // Check if OTHER meeting types have slots in the requested window
          const allTypeIds = userTypes.map(t => t.id);
          const otherTypeIds = allTypeIds.filter(id => !typeIds.includes(id));
          let typeSwitchSuggestion = "";

          if (otherTypeIds.length > 0) {
            try {
              const altSlots = await findAvailableSlotsMultiType(
                session.organizerId, null, otherTypeIds, mergedPreferences, 14,
              );
              const matchingAltSlots = altSlots.filter(slot =>
                recipientPrefers.some(pref => {
                  if (pref.start && pref.end) {
                    return slot.start < new Date(pref.end) && slot.end > new Date(pref.start);
                  }
                  return false;
                }),
              );
              if (matchingAltSlots.length > 0) {
                const altTypeNames = [...new Set(matchingAltSlots.map(s => s.meetingTypeName).filter(Boolean))];
                typeSwitchSuggestion = ` However, there IS availability during that window for other meeting types: ${altTypeNames.join(", ")}. `
                  + `You could suggest switching — e.g., "I don't have coffee availability at that time, but I could offer a ${altTypeNames[0]?.toLowerCase()} instead if that works?"`;
              }
            } catch {
              // Non-fatal — just skip the suggestion
            }
          }

          preferencesMismatchNote = `The recipient requested "${wantedDesc}" but NONE of the available ${primaryType?.name ?? "meeting"} slots fall within that window. `
            + `The ${primaryType?.name ?? "meeting"} type is only available during certain hours. `
            + `Be honest: tell them those times aren't available for ${primaryType?.name?.toLowerCase() ?? "this type of meeting"}, show the closest alternatives you have, and ask if a different time would work.`
            + typeSwitchSuggestion;
        }
      }

      // Timeline check: if meeting type is in-person and best slots are >7 days
      // past the organizer's original preferred window, suggest going online
      if (!preferencesMismatchNote && primaryType && !primaryType.isOnline && realSlots.length > 0) {
        const orgPrefers = session.organizerPreferences.filter(p => p.type === "prefer" && p.end);
        if (orgPrefers.length > 0) {
          const latestPreferred = new Date(Math.max(...orgPrefers.map(p => new Date(p.end!).getTime())));
          const sevenDaysLater = new Date(latestPreferred.getTime() + 7 * 24 * 60 * 60 * 1000);
          const earliestSlot = realSlots[0].start;

          if (earliestSlot > sevenDaysLater) {
            const onlineTypes = userTypes.filter(t => t.isOnline);
            if (onlineTypes.length > 0) {
              const onlineNames = onlineTypes.map(t => t.name.toLowerCase()).join(" or ");
              preferencesMismatchNote = `The earliest available ${primaryType.name.toLowerCase()} slot is more than a week past the originally requested timeframe. `
                + `Consider suggesting to bring the meeting in sooner by switching to an online format (${onlineNames}). `
                + `Frame it naturally: "The earliest I can find for an in-person ${primaryType.name.toLowerCase()} is [date]. Would you prefer to do a ${onlineNames} sooner instead?"`;
            }
          }
        }
      }
    }

    const composerCtx = buildSimComposerContext(extracted.intent, {
      meetingTitle: `Meeting with ${session.recipientName}`,
      organizerName: session.organizerName,
      participantNames: [session.recipientName || session.recipientEmail.split("@")[0]],
      senderName: session.recipientName,
      formattedSlots: replySlots?.formatted,
      slotTypeLabels: replySlots?.typeLabels,
      proposedSlots: session.proposedSlots,
      selectedTime: extracted.selected_time,
      tz: session.tz,
      originalEmailSummary: extracted.meeting_context_summary,
      preferencesMismatchNote,
    });

    // Update meeting status based on intent
    if (extracted.intent === "confirm_time") {
      session.meetingStatus = "confirmed";
    } else if (extracted.intent === "reschedule" || extracted.intent === "ask_for_more_times" || extracted.intent === "propose_alternatives") {
      session.meetingStatus = "proposed";
      session.proposedSlots = replySlots?.raw ?? [];
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
    const { msg, isAuthError } = classifyError(err);
    return c.json({
      error: msg,
      authError: isAuthError,
      reconnectUrl: isAuthError ? `/auth/google?userId=${session.organizerId}` : undefined,
      timing: { total: `${Date.now() - totalStart}ms` },
    }, isAuthError ? 401 : 500);
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract a meaningful error message and detect auth errors from Google API responses. */
function classifyError(err: unknown): { msg: string; isAuthError: boolean } {
  // Build a comprehensive error string from all possible locations
  const parts: string[] = [];

  if (err instanceof Error) {
    parts.push(err.message);
  }
  if (typeof err === "string") {
    parts.push(err);
  }

  // GaxiosError nests details in response.data
  const anyErr = err as Record<string, unknown>;
  if (anyErr?.response) {
    const resp = anyErr.response as Record<string, unknown>;
    if (resp.data) {
      const data = resp.data as Record<string, unknown>;
      if (data.error) {
        if (typeof data.error === "string") parts.push(data.error);
        else if (typeof (data.error as Record<string, unknown>)?.message === "string") {
          parts.push((data.error as Record<string, string>).message);
        }
      }
      if (typeof data.error_description === "string") parts.push(data.error_description);
    }
    if (typeof resp.status === "number") parts.push(`HTTP ${resp.status}`);
  }

  // Also check code property (some Google errors use this)
  if (typeof anyErr?.code === "number" || typeof anyErr?.code === "string") {
    parts.push(`code: ${anyErr.code}`);
  }

  const msg = parts.length > 0 ? parts.join(" — ") : "Unknown error";
  const fullText = (msg + " " + JSON.stringify(err)).toLowerCase();
  const isAuthError =
    fullText.includes("invalid_grant") ||
    fullText.includes("invalid credentials") ||
    fullText.includes("token has been expired or revoked") ||
    fullText.includes("no google calendar connected") ||
    fullText.includes("has no google calendar") ||
    fullText.includes("401");

  return { msg, isAuthError };
}

/** Format real ProposedSlot[] results from the slot proposer into display strings. */
function formatRealSlots(
  slots: ProposedSlot[],
  tz: string,
): { formatted: string; raw: string[]; typeLabels?: string[] } {
  const picked = slots.slice(0, 3);

  // Build labels only when slots come from multiple types
  const distinctTypes = new Set(picked.map(p => p.meetingTypeName).filter(Boolean));
  const showLabels = distinctTypes.size > 1;

  const formatted = picked
    .map((s, i) => {
      const label = showLabels && s.meetingTypeName ? ` (${s.meetingTypeName.toLowerCase()})` : "";
      return `${i + 1}. ${formatSlot(s.start, s.end, tz)}${label}`;
    })
    .join("\n");

  const raw = picked.map((s) => formatSlot(s.start, s.end, tz));
  const typeLabels = showLabels ? picked.map(p => p.meetingTypeName ?? "") : undefined;

  return { formatted, raw, typeLabels };
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
    selectedTime?: { start: string; end: string };
    tz?: string;
    originalEmailSummary?: string;
    preferencesMismatchNote?: string;
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
    ...(opts.preferencesMismatchNote ? { preferencesMismatchNote: opts.preferencesMismatchNote } : {}),
  };

  switch (intent) {
    case "schedule_new":
      return {
        ...base,
        formattedSlots: opts.formattedSlots,
        pickerLink: `${env.APP_URL}/meeting/sim-test`,
      };
    case "confirm_time": {
      let confirmedTime = opts.proposedSlots?.[0] ?? "Wednesday at 2:00 PM";
      // If we have the actual selected time from the extractor, format it properly
      if (opts.selectedTime) {
        const start = new Date(opts.selectedTime.start);
        const end = new Date(opts.selectedTime.end);
        confirmedTime = formatSlot(start, end, opts.tz ?? "America/New_York");
      }
      return {
        ...base,
        confirmedTime,
        rescheduleLink: `${env.APP_URL}/meeting/sim-test`,
      };
    }
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
