import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { sendIMessage } from "../lib/imessage.js";
import { env } from "../config.js";

export type NotificationType =
  | "meeting_confirmed"
  | "meeting_rescheduled"
  | "meeting_cancelled"
  | "google_token_expired"
  | "email_sent"
  | "draft_ready"
  | "draft_flagged"
  | "draft_sent"
  | "draft_rejected";

interface NotificationPayload {
  type: NotificationType;
  userId: string;
  meetingTitle: string;
  meetingShortId: string;
  confirmedTime?: string;
}

interface DraftNotificationPayload {
  type: "draft_ready" | "draft_flagged";
  userId: string;
  meetingTitle: string;
  shortCode: string;
  composedText: string;
  recipients: string[];
  issues?: string[];
  questions?: string[];
  suggestions?: string[];
}

export async function notifyUser(payload: NotificationPayload): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  if (!user) return;

  const message = formatMessage(payload);

  if (user.imessageId) {
    await sendIMessage(user.imessageId, message);
  }
}

export async function notifyDraftReady(payload: DraftNotificationPayload): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  if (!user?.imessageId) return;

  const message = formatDraftMessage(payload);
  await sendIMessage(user.imessageId, message);
}

function formatMessage(payload: NotificationPayload): string {
  const meetingUrl = `${env.APP_URL}/meeting/${payload.meetingShortId}`;

  switch (payload.type) {
    case "meeting_confirmed":
      return `Your meeting "${payload.meetingTitle}" has been confirmed for ${payload.confirmedTime}. ${meetingUrl}`;
    case "meeting_rescheduled":
      return `Your meeting "${payload.meetingTitle}" is being rescheduled. ${meetingUrl}`;
    case "meeting_cancelled":
      return `Your meeting "${payload.meetingTitle}" has been cancelled.`;
    case "google_token_expired":
      return `Luca's connection to your Google Calendar has expired. A scheduling request for "${payload.meetingTitle}" couldn't be processed. Reconnect at ${env.APP_URL}/settings — Luca will retry automatically.`;
    case "email_sent":
      return `Luca sent a reply for "${payload.meetingTitle}." ${payload.meetingShortId ? `${env.APP_URL}/meeting/${payload.meetingShortId}` : ""}`;
    default:
      return "";
  }
}

function formatDraftMessage(payload: DraftNotificationPayload): string {
  const recipientList = payload.recipients.join(", ");
  // Truncate draft preview to keep iMessage readable
  const preview = payload.composedText.length > 500
    ? payload.composedText.slice(0, 500) + "..."
    : payload.composedText;

  if (payload.type === "draft_flagged") {
    const parts: string[] = [
      `Luca's QC flagged issues with a draft for "${payload.meetingTitle}" to ${recipientList}:`,
    ];

    if (payload.issues && payload.issues.length > 0) {
      parts.push(`\nIssues:\n${payload.issues.map((i) => `- ${i}`).join("\n")}`);
    }

    if (payload.questions && payload.questions.length > 0) {
      parts.push(`\nQuestions:\n${payload.questions.map((q) => `- ${q}`).join("\n")}`);
    }

    if (payload.suggestions && payload.suggestions.length > 0) {
      parts.push(`\nSuggestions:\n${payload.suggestions.map((s) => `- ${s}`).join("\n")}`);
    }

    parts.push(`\n---\n${preview}\n---`);
    parts.push(`\nReply: "send ${payload.shortCode}" to send anyway`);
    parts.push(`Reply: "reject ${payload.shortCode}" to discard`);
    parts.push(`Reply: "edit ${payload.shortCode}: [your version]" to modify and send`);

    return parts.join("\n");
  }

  // draft_ready (QC passed)
  return [
    `Luca drafted a reply for "${payload.meetingTitle}" to ${recipientList}:`,
    `\n---\n${preview}\n---`,
    `\nReply: "send ${payload.shortCode}" to approve`,
    `Reply: "reject ${payload.shortCode}" to discard`,
    `Reply: "edit ${payload.shortCode}: [your version]" to modify and send`,
  ].join("\n");
}
