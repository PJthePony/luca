import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, emailThreads, emailMessages, proposedSlots, users } from "../db/schema.js";
import { parseInboundEmail } from "./ai-parser.js";
import { getAttendeeEmails } from "./queries.js";
import {
  handleScheduleNew,
  buildCalendarDescription,
} from "./intent-handlers.js";
import type { IntentContext } from "./intent-handlers.js";
import type { GoogleTokens } from "../types/index.js";
import { EmailDirection } from "../types/index.js";

export interface RetryableMeeting {
  id: string;
  shortId: string;
  title: string | null;
  status: string;
  createdAt: Date;
  attendees: string[];
}

/**
 * Find meetings that can be retried for a given user.
 * Returns meeting metadata for display in a confirmation UI.
 */
export async function findRetryableMeetings(userId: string): Promise<RetryableMeeting[]> {
  const pendingMeetings = await db.query.meetings.findMany({
    where: and(
      eq(meetings.organizerId, userId),
      inArray(meetings.status, ["awaiting_reauth", "draft"]),
    ),
  });

  const retryable: RetryableMeeting[] = [];

  for (const meeting of pendingMeetings) {
    const thread = await db.query.emailThreads.findFirst({
      where: eq(emailThreads.meetingId, meeting.id),
    });
    if (!thread) continue;

    // For draft meetings, only include if Luca never responded
    if (meeting.status === "draft") {
      const hasSlots = await db.query.proposedSlots.findFirst({
        where: eq(proposedSlots.meetingId, meeting.id),
      });
      if (hasSlots) continue;

      const hasOutbound = await db.query.emailMessages.findFirst({
        where: and(
          eq(emailMessages.threadId, thread.id),
          eq(emailMessages.direction, EmailDirection.OUTBOUND),
        ),
      });
      if (hasOutbound) continue;
    }

    // Must have at least one inbound email to retry
    const hasInbound = await db.query.emailMessages.findFirst({
      where: and(
        eq(emailMessages.threadId, thread.id),
        eq(emailMessages.direction, EmailDirection.INBOUND),
      ),
    });
    if (!hasInbound) continue;

    // Get attendee emails for display
    const replyTo = await getAttendeeEmails(meeting.id);

    retryable.push({
      id: meeting.id,
      shortId: meeting.shortId,
      title: meeting.title,
      status: meeting.status,
      createdAt: meeting.createdAt,
      attendees: replyTo,
    });
  }

  return retryable;
}

/**
 * Retry a single meeting by ID. Called after user approval.
 */
export async function retryMeetingById(meetingId: string, userId: string): Promise<boolean> {
  const organizer = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!organizer) return false;

  const tokens = organizer.googleTokens as GoogleTokens | null;
  if (!tokens) return false;

  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.organizerId, userId)),
  });
  if (!meeting) return false;

  const thread = await db.query.emailThreads.findFirst({
    where: eq(emailThreads.meetingId, meeting.id),
  });
  if (!thread) return false;

  const latestEmail = await db.query.emailMessages.findFirst({
    where: and(
      eq(emailMessages.threadId, thread.id),
      eq(emailMessages.direction, EmailDirection.INBOUND),
    ),
    orderBy: (msg, { desc }) => [desc(msg.createdAt)],
  });
  if (!latestEmail) return false;

  // Reset status to draft before retrying
  await db
    .update(meetings)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(meetings.id, meeting.id));

  const parsed = await parseInboundEmail(
    latestEmail.bodyText ?? "",
    latestEmail.fromEmail,
    latestEmail.fromName ?? "",
    latestEmail.subject,
    meeting.id,
    organizer.id,
  );

  const tz = organizer.timezone || "America/New_York";
  const replyTo = await getAttendeeEmails(meeting.id);

  const updatedAgenda = [
    ...((meeting.agenda as string[]) ?? []),
    ...(parsed.agenda_items ?? []),
  ];
  const calendarDescription = buildCalendarDescription(
    meeting.notes ?? parsed.meeting_context_summary,
    updatedAgenda,
  );

  const ctx: IntentContext = {
    meeting,
    thread: { id: thread.id, subject: thread.subject },
    organizer: {
      id: organizer.id,
      name: organizer.name,
      email: organizer.email,
      timezone: tz,
      googleTokens: organizer.googleTokens,
    },
    tz,
    tokens,
    replyTo,
    parsed,
    calendarDescription,
    emailSubject: thread.subject,
  };

  await handleScheduleNew(ctx);
  console.log(`Retried meeting ${meeting.shortId} successfully`);
  return true;
}

/**
 * Dismiss a meeting from the retry queue (mark as cancelled).
 */
export async function dismissRetryableMeeting(meetingId: string, userId: string): Promise<boolean> {
  // Verify ownership before dismissing
  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.organizerId, userId)),
  });
  if (!meeting) return false;

  await db
    .update(meetings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));

  return true;
}
