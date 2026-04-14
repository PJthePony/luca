import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { sendEmail } from "../lib/mailgun.js";
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

  const { subject, text } = formatNotificationEmail(payload);

  try {
    await sendEmail({
      to: [user.email],
      subject,
      text,
    });
  } catch (err) {
    console.error("Failed to send notification email:", err);
  }
}

export async function notifyDraftReady(payload: DraftNotificationPayload): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  if (!user) return;

  const { subject, text } = formatDraftEmail(payload);

  try {
    await sendEmail({
      to: [user.email],
      subject,
      text,
    });
  } catch (err) {
    console.error("Failed to send draft notification email:", err);
  }
}

function formatNotificationEmail(payload: NotificationPayload): { subject: string; text: string } {
  const meetingUrl = `${env.APP_URL}/meeting/${payload.meetingShortId}`;

  switch (payload.type) {
    case "meeting_confirmed":
      return {
        subject: `Luca: "${payload.meetingTitle}" confirmed`,
        text: `Your meeting "${payload.meetingTitle}" has been confirmed for ${payload.confirmedTime}.\n\n${meetingUrl}`,
      };
    case "meeting_rescheduled":
      return {
        subject: `Luca: "${payload.meetingTitle}" is being rescheduled`,
        text: `Your meeting "${payload.meetingTitle}" is being rescheduled. New times will be proposed.\n\n${meetingUrl}`,
      };
    case "meeting_cancelled":
      return {
        subject: `Luca: "${payload.meetingTitle}" cancelled`,
        text: `Your meeting "${payload.meetingTitle}" has been cancelled.`,
      };
    case "google_token_expired":
      return {
        subject: `Luca: Google Calendar connection expired`,
        text: `Luca's connection to your Google Calendar has expired. A scheduling request for "${payload.meetingTitle}" couldn't be processed.\n\nReconnect at ${env.APP_URL}/settings — Luca will retry automatically.`,
      };
    case "email_sent":
      return {
        subject: `Luca: Replied for "${payload.meetingTitle}"`,
        text: `Luca sent a reply for "${payload.meetingTitle}" on your behalf.${payload.meetingShortId ? `\n\n${meetingUrl}` : ""}`,
      };
    default:
      return {
        subject: `Luca: ${payload.meetingTitle}`,
        text: `Notification about "${payload.meetingTitle}".`,
      };
  }
}

function formatDraftEmail(payload: DraftNotificationPayload): { subject: string; text: string } {
  const recipientList = payload.recipients.join(", ");
  const preview = payload.composedText.length > 1000
    ? payload.composedText.slice(0, 1000) + "..."
    : payload.composedText;

  const approvalUrl = `${env.APP_URL}/drafts/${payload.shortCode}`;

  if (payload.type === "draft_flagged") {
    const parts: string[] = [
      `Luca's QC flagged issues with a draft for "${payload.meetingTitle}" to ${recipientList}.`,
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

    parts.push(`\n--- Draft ---\n${preview}\n---`);
    parts.push(`\nReview and approve at: ${approvalUrl}`);

    return {
      subject: `Luca: Draft needs review — "${payload.meetingTitle}"`,
      text: parts.join("\n"),
    };
  }

  // draft_ready (QC passed) — shouldn't happen anymore since we auto-send,
  // but keep for backwards compatibility
  return {
    subject: `Luca: Draft ready — "${payload.meetingTitle}"`,
    text: [
      `Luca drafted a reply for "${payload.meetingTitle}" to ${recipientList}:`,
      `\n--- Draft ---\n${preview}\n---`,
      `\nReview at: ${approvalUrl}`,
    ].join("\n"),
  };
}
