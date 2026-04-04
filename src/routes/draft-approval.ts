import { Hono } from "hono";
import {
  approveDraft,
  rejectDraft,
  editAndSendDraft,
  findDraftByShortCode,
} from "../services/draft-manager.js";
import { sendIMessage } from "../lib/imessage.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const draftApprovalRoutes = new Hono();

/**
 * Inbound iMessage webhook — receives P.J.'s replies to draft notifications.
 * Expected payload: { sender: string, message: string }
 *
 * Commands:
 *   send XXXX         — approve and send the draft
 *   reject XXXX       — discard the draft
 *   edit XXXX: [text] — replace draft text and send
 */
draftApprovalRoutes.post("/inbound", async (c) => {
  const body = await c.req.json<{ sender: string; message: string }>();
  const { sender, message } = body;

  if (!message || !sender) {
    return c.json({ status: "invalid", error: "Missing sender or message" }, 400);
  }

  const text = message.trim();

  // Parse command
  const sendMatch = text.match(/^send\s+([A-Za-z0-9]{4})\s*$/i);
  const rejectMatch = text.match(/^reject\s+([A-Za-z0-9]{4})\s*$/i);
  const editMatch = text.match(/^edit\s+([A-Za-z0-9]{4}):\s*(.+)$/is);

  let result: { success: boolean; error?: string };
  let action: string;
  let shortCode: string;

  if (sendMatch) {
    shortCode = sendMatch[1].toUpperCase();
    action = "send";
    result = await approveDraft(shortCode);
  } else if (rejectMatch) {
    shortCode = rejectMatch[1].toUpperCase();
    action = "reject";
    result = await rejectDraft(shortCode);
  } else if (editMatch) {
    shortCode = editMatch[1].toUpperCase();
    action = "edit";
    const editedText = editMatch[2].trim();
    result = await editAndSendDraft(shortCode, editedText);
  } else {
    // Unrecognized command — try to help
    await replyToSender(sender, `I didn't understand that command. Try:\n- "send XXXX" to approve a draft\n- "reject XXXX" to discard it\n- "edit XXXX: [your version]" to modify and send`);
    return c.json({ status: "unrecognized" });
  }

  // Confirm the action back to the sender
  if (result.success) {
    const confirmations: Record<string, string> = {
      send: `Draft ${shortCode} has been sent.`,
      reject: `Draft ${shortCode} has been discarded.`,
      edit: `Draft ${shortCode} has been updated and sent.`,
    };
    await replyToSender(sender, confirmations[action]);
  } else {
    await replyToSender(sender, `Could not ${action} draft ${shortCode}: ${result.error}`);
  }

  return c.json({ status: "processed", action, shortCode, success: result.success });
});

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

/** Helper to reply via iMessage. */
async function replyToSender(sender: string, message: string) {
  try {
    await sendIMessage(sender, message);
  } catch (err) {
    console.error("Failed to reply to draft approval sender:", err);
  }
}
