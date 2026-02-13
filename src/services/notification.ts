import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { sendIMessage } from "../lib/imessage.js";
import { env } from "../config.js";

export type NotificationType =
  | "meeting_confirmed"
  | "meeting_rescheduled"
  | "meeting_cancelled";

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
  }
}
