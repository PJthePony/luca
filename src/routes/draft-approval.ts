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
    return c.html(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Draft not found — Luca</title>${fontLinks}<style>${baseStyles}body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}</style></head><body><div><h1>Something got lost on the way to the docks.</h1><p class="text-muted" style="margin-top:12px;">No draft matches that code. It may have already been sent or rejected.</p></div></body></html>`, 404);
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
    body { padding: 24px; }
    .container { max-width: 700px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .header h1 {
      font-family: var(--font-serif);
      font-size: 1.5rem;
      font-weight: 600;
      font-variation-settings: 'opsz' 48, 'WONK' 1;
      letter-spacing: -0.02em;
    }
    .card h2 {
      font-family: var(--font-serif);
      font-size: 1.05rem;
      font-weight: 600;
      font-variation-settings: 'opsz' 24, 'WONK' 1;
      letter-spacing: -0.015em;
      color: var(--nxb-color-text);
      margin-bottom: 10px;
      border: none;
      padding: 0;
    }
    .meta {
      font-family: var(--font-sans);
      font-size: 0.82rem;
      color: var(--nxb-color-text-secondary);
      margin-bottom: 14px;
      line-height: 1.7;
    }
    .meta strong {
      font-family: var(--font-sans);
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nxb-color-text-muted);
      margin-right: 6px;
    }
    .draft-body {
      white-space: pre-wrap;
      font-family: var(--font-serif);
      font-size: 0.95rem;
      line-height: 1.65;
      background: var(--sage-100);
      border: 1px solid var(--nxb-color-border);
      border-radius: var(--nxb-radius-sm);
      padding: 16px 18px;
      margin-bottom: 16px;
      font-variation-settings: 'opsz' 14;
    }
    .issues { margin-bottom: 16px; }
    .issues h3 {
      font-family: var(--font-sans);
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--danger-600);
      margin-bottom: 8px;
    }
    .issues ul { font-size: 0.82rem; padding-left: 18px; margin: 0; line-height: 1.65; }
    .issues li { margin-bottom: 4px; }
    .issues li::marker { color: var(--fuchsia-600); }
    .edit-area {
      width: 100%;
      min-height: 150px;
      padding: 14px;
      border: 1px solid var(--nxb-color-border-light);
      border-radius: var(--nxb-radius-sm);
      font-family: var(--font-serif);
      font-size: 0.95rem;
      line-height: 1.65;
      background: var(--sage-100);
      color: var(--nxb-color-text);
      resize: vertical;
      margin-bottom: 12px;
      transition: border-color var(--nxb-transition-fast), box-shadow var(--nxb-transition-fast);
    }
    .edit-area:focus {
      outline: none;
      border-color: var(--fuchsia-600);
      background: var(--sage-50);
      box-shadow: 0 0 0 3px rgba(212, 36, 111, 0.12);
    }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
      padding: 9px 20px;
      border-radius: var(--nxb-radius-md);
      font-weight: 600;
      font-size: 0.88rem;
      letter-spacing: -0.005em;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background var(--nxb-transition-fast), color var(--nxb-transition-fast), border-color var(--nxb-transition-fast), transform var(--nxb-transition-fast), box-shadow var(--nxb-transition-fast);
    }
    .btn-send {
      background: var(--fuchsia-600);
      color: white;
      box-shadow: 0 12px 22px -14px rgba(212,36,111,0.55), 0 1px 0 rgba(255,255,255,0.15) inset;
    }
    .btn-send:hover { background: var(--fuchsia-800); transform: translateY(-1px); }
    .btn-edit {
      background: var(--warning-100);
      color: var(--warning-600);
      border: 1px solid rgba(208, 104, 42, 0.3);
    }
    .btn-edit:hover { background: rgba(208, 104, 42, 0.18); }
    .btn-reject {
      background: transparent;
      color: var(--danger-600);
      border: 1.5px solid var(--danger-600);
    }
    .btn-reject:hover { background: var(--danger-100); }
    .status-badge {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 999px;
      font-family: var(--font-sans);
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      border: 1px solid transparent;
    }
    .badge-sent     { background: var(--success-100); color: var(--success-600); border-color: rgba(43,138,110,0.25); }
    .badge-rejected { background: var(--danger-100);  color: var(--danger-600);  border-color: rgba(168,58,74,0.25); }
    .badge-pending  { background: var(--warning-100); color: var(--warning-600); border-color: rgba(208,104,42,0.25); }
    #result {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: var(--nxb-radius-sm);
      display: none;
      font-size: 0.88rem;
      border: 1px solid transparent;
    }
    .result-ok  { background: var(--success-100); color: var(--success-600); border-color: rgba(43,138,110,0.25); }
    .result-err { background: var(--danger-100);  color: var(--danger-600);  border-color: rgba(168,58,74,0.25); }
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
        <label style="display:block;font-family:var(--font-sans);font-size:0.68rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--nxb-color-text-secondary);margin-bottom:8px;">Edit draft <span style="font-style:italic;font-family:var(--font-serif);font-weight:400;text-transform:none;letter-spacing:0;color:var(--nxb-color-text-muted);">(optional)</span></label>
        <textarea class="edit-area" id="editText" placeholder="Paste your edited version here, or leave empty to send as-is…">${escapeHtml(draft.composedText)}</textarea>
      </div>

      <div class="actions">
        <button class="btn btn-send" onclick="sendDraft()">Send as-is</button>
        <button class="btn btn-edit" onclick="sendEdited()">Send edited version</button>
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
