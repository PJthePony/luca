import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { sendIMessage } from "../lib/imessage.js";
import { env } from "../config.js";

export type NotificationType =
  | "meeting_confirmed"
  | "meeting_rescheduled"
  | "meeting_cancelled"
  | "google_token_expired";

interface NotificationPayload {
  type: NotificationType;
  userId: string;
  meetingTitle: string;
  meetingShortId: string;
  confirmedTime?: string;
}

export async function notifyUser(payload: NotificationPayload): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  if (!user) return;

  const message = formatMessage(payload);

  // Send iMessage if the user has it configured
  if (user.imessageId) {
    await sendIMessage(user.imessageId, message);
  }
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
  }
}
