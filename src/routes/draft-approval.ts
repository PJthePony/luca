import { Hono } from "hono";
import {
  approveDraft,
  rejectDraft,
  editAndSendDraft,
  findDraftByShortCode,
} from "../services/draft-manager.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { baseStyles, fontLinks, logoSvg } from "../lib/styles.js";

export const draftApprovalRoutes = new Hono();

// Note: The old iMessage inbound webhook (/inbound) has been removed.
// Draft approval now happens via the web review page at /review/:shortCode.

/**
 * HTTP API for approving drafts (alternative to iMessage, can be used from dashboard).
 */
draftApprovalRoutes.post("/approve/:shortCode", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const result = await approveDraft(shortCode);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ status: "sent", shortCode });
});

draftApprovalRoutes.post("/reject/:shortCode", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const result = await rejectDraft(shortCode);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ status: "rejected", shortCode });
});

draftApprovalRoutes.post("/edit/:shortCode", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const body = await c.req.json<{ text: string }>();

  if (!body.text) {
    return c.json({ error: "Missing text" }, 400);
  }

  const result = await editAndSendDraft(shortCode, body.text);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ status: "edited_and_sent", shortCode });
});

/** Get a pending draft by short code (for dashboard preview). */
draftApprovalRoutes.get("/draft/:shortCode", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const draft = await findDraftByShortCode(shortCode);

  if (!draft) {
    return c.json({ error: "Draft not found" }, 404);
  }

  return c.json(draft);
});

/** Web review page — linked from notification emails. */
draftApprovalRoutes.get("/review/:shortCode", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const draft = await findDraftByShortCode(shortCode);

  if (!draft) {
    return c.html("<h1>Draft not found</h1>", 404);
  }

  const qc = draft.qcResult as { issues?: string[]; questions?: string[]; suggestions?: string[] } | null;
  const alreadySent = draft.status === "sent" || draft.status === "edited";
  const rejected = draft.status === "rejected";

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luca — Review Draft ${shortCode}</title>
  ${fontLinks}
  <style>
    ${baseStyles}
    body { background: var(--nxb-color-bg); color: var(--nxb-color-text); line-height: 1.6; padding: 24px; }
    .container { max-width: 700px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 1.3rem; font-weight: 600; }
    .card { background: var(--nxb-color-surface); border: 1px solid var(--nxb-color-border); border-radius: 10px; padding: 20px; margin-bottom: 16px; }
    .card h2 { font-size: 0.95rem; font-weight: 600; color: var(--nxb-color-text-secondary); margin-bottom: 10px; }
    .meta { font-size: 0.82rem; color: var(--nxb-color-text-secondary); margin-bottom: 12px; }
    .draft-body { white-space: pre-wrap; font-size: 0.9rem; line-height: 1.6; background: #f8fafc; border: 1px solid var(--nxb-color-border); border-radius: 6px; padding: 14px; margin-bottom: 16px; }
    .issues { margin-bottom: 16px; }
    .issues h3 { font-size: 0.85rem; font-weight: 600; color: #dc2626; margin-bottom: 6px; }
    .issues ul { font-size: 0.82rem; padding-left: 18px; margin: 0; }
    .issues li { margin-bottom: 4px; }
    .edit-area { width: 100%; min-height: 150px; padding: 12px; border: 1px solid var(--nxb-color-border); border-radius: 6px; font-size: 0.9rem; font-family: inherit; resize: vertical; margin-bottom: 12px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { padding: 8px 20px; border-radius: 6px; font-weight: 500; font-size: 0.85rem; cursor: pointer; border: none; }
    .btn-send { background: var(--nxb-color-primary); color: white; }
    .btn-send:hover { opacity: 0.9; }
    .btn-edit { background: #f59e0b; color: white; }
    .btn-edit:hover { opacity: 0.9; }
    .btn-reject { background: white; color: #dc2626; border: 1px solid #dc2626; }
    .btn-reject:hover { background: #fef2f2; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
    .badge-sent { background: #dcfce7; color: #166534; }
    .badge-rejected { background: #fee2e2; color: #991b1b; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    #result { margin-top: 12px; padding: 10px; border-radius: 6px; display: none; font-size: 0.85rem; }
    .result-ok { background: #dcfce7; color: #166534; }
    .result-err { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoSvg}
      <h1>Draft Review</h1>
    </div>

    <div class="card">
      <h2>Draft ${shortCode}
        ${alreadySent ? '<span class="status-badge badge-sent">SENT</span>' : rejected ? '<span class="status-badge badge-rejected">REJECTED</span>' : '<span class="status-badge badge-pending">PENDING</span>'}
      </h2>
      <div class="meta">
        <strong>To:</strong> ${draft.toEmails.join(", ")}<br />
        <strong>Subject:</strong> ${draft.subject}<br />
        <strong>Intent:</strong> ${draft.intent}
      </div>

      ${qc?.issues?.length ? `
      <div class="issues">
        <h3>QC Issues</h3>
        <ul>${qc.issues.map((i: string) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      </div>` : ""}

      ${qc?.questions?.length ? `
      <div class="issues">
        <h3>Questions</h3>
        <ul>${qc.questions.map((q: string) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>
      </div>` : ""}

      <div class="draft-body" id="draftText">${escapeHtml(draft.composedText)}</div>

      ${!alreadySent && !rejected ? `
      <div style="margin-bottom: 12px;">
        <label style="font-size: 0.82rem; font-weight: 500; color: var(--nxb-color-text-secondary);">Edit draft (optional):</label>
        <textarea class="edit-area" id="editText" placeholder="Paste your edited version here, or leave empty to send as-is...">${escapeHtml(draft.composedText)}</textarea>
      </div>

      <div class="actions">
        <button class="btn btn-send" onclick="sendDraft()">Send As-Is</button>
        <button class="btn btn-edit" onclick="sendEdited()">Send Edited Version</button>
        <button class="btn btn-reject" onclick="rejectDraft()">Reject</button>
      </div>` : ""}

      <div id="result"></div>
    </div>
  </div>

  <script>
    async function sendDraft() {
      await doAction('/approval/approve/${shortCode}', 'POST');
    }

    async function sendEdited() {
      var edited = document.getElementById('editText').value.trim();
      if (!edited) { alert('Please enter your edited version.'); return; }
      await doAction('/approval/edit/${shortCode}', 'POST', { text: edited });
    }

    async function rejectDraft() {
      if (!confirm('Reject this draft? It will not be sent.')) return;
      await doAction('/approval/reject/${shortCode}', 'POST');
    }

    async function doAction(url, method, body) {
      var result = document.getElementById('result');
      try {
        var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        var res = await fetch(url, opts);
        var data = await res.json();
        if (res.ok) {
          result.className = 'result-ok';
          result.textContent = 'Done! ' + JSON.stringify(data.status || data);
          result.style.display = 'block';
          setTimeout(function() { location.reload(); }, 1500);
        } else {
          result.className = 'result-err';
          result.textContent = 'Error: ' + (data.error || 'Unknown error');
          result.style.display = 'block';
        }
      } catch (e) {
        result.className = 'result-err';
        result.textContent = 'Network error: ' + e.message;
        result.style.display = 'block';
      }
    }
  </script>
</body>
</html>`);
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
