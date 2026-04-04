import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  meetings,
  meetingTypes,
  emailThreads,
  emailMessages,
  users,
  availabilityRules,
  proposedSlots,
} from "../db/schema.js";
import { parseEmail } from "../lib/claude.js";
import { extractIntent } from "./ai-pipeline.js";
import type { ParsedEmail, ExtractedData } from "../types/index.js";

/** Build the shared context needed by both old and new parsing pipelines. */
async function buildParseContext(meetingId: string, organizerId: string) {
  const organizer = await db.query.users.findFirst({
    where: eq(users.id, organizerId),
  });
  if (!organizer) throw new Error("Organizer not found");

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });

  const thread = await db.query.emailThreads.findFirst({
    where: eq(emailThreads.meetingId, meetingId),
  });

  let threadHistory = "";
  if (thread) {
    const messages = await db.query.emailMessages.findMany({
      where: eq(emailMessages.threadId, thread.id),
      orderBy: (msg, { asc }) => [asc(msg.createdAt)],
    });

    threadHistory = messages
      .map(
        (m) =>
          `[${m.direction}] From: ${m.fromName || m.fromEmail}\n${m.bodyText?.slice(0, 500) ?? ""}`,
      )
      .join("\n---\n");
  }

  let proposedTimes: string[] = [];
  if (meeting?.status === "proposed") {
    const slots = await db.query.proposedSlots.findMany({
      where: eq(proposedSlots.meetingId, meetingId),
    });
    const tzOpt = { timeZone: organizer.timezone || "America/New_York" };
    proposedTimes = slots.map(
      (s) =>
        `${s.startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", ...tzOpt })} at ${s.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...tzOpt })} - ${s.endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...tzOpt })}`,
    );
  }

  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.userId, organizerId),
  });
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const availabilityPreferences = rules
    .filter((r) => r.isActive)
    .map((r) => `${days[r.dayOfWeek]}: ${r.startTime} - ${r.endTime}`)
    .join(", ");

  const existingAgenda = (meeting?.agenda as string[]) ?? [];

  const userTypes = await db.query.meetingTypes.findMany({
    where: eq(meetingTypes.userId, organizerId),
  });
  const userMeetingTypes = userTypes.map((t) => ({
    id: t.id,
    name: t.name,
    isOnline: t.isOnline,
    defaultDuration: t.defaultDuration,
  }));

  return {
    organizer,
    meeting,
    threadHistory,
    context: {
      organizerName: organizer.name,
      organizerEmail: organizer.email,
      organizerTimezone: organizer.timezone,
      meetingStatus: meeting?.status,
      proposedTimes,
      threadHistory: threadHistory || undefined,
      availabilityPreferences: availabilityPreferences || undefined,
      existingAgenda: existingAgenda.length > 0 ? existingAgenda : undefined,
      userMeetingTypes,
    },
  };
}

/**
 * Parse an inbound email using Claude (legacy single-call pipeline).
 * Kept for backwards compatibility during transition.
 */
export async function parseInboundEmail(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  meetingId: string,
  organizerId: string,
): Promise<ParsedEmail> {
  const { context } = await buildParseContext(meetingId, organizerId);
  return parseEmail(emailBody, senderEmail, senderName, subject, context);
}

/**
 * Extract intent using Agent 1 (new pipeline).
 * Returns structured data only, no email prose.
 */
export async function extractInboundEmail(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  meetingId: string,
  organizerId: string,
): Promise<{ extracted: ExtractedData; threadHistory: string }> {
  const { context, threadHistory } = await buildParseContext(meetingId, organizerId);
  const extracted = await extractIntent(emailBody, senderEmail, senderName, subject, context);
  return { extracted, threadHistory };
}

/**
 * Get thread history for a meeting (used by QC agent).
 */
export async function getThreadHistory(meetingId: string): Promise<string> {
  const thread = await db.query.emailThreads.findFirst({
    where: eq(emailThreads.meetingId, meetingId),
  });

  if (!thread) return "";

  const messages = await db.query.emailMessages.findMany({
    where: eq(emailMessages.threadId, thread.id),
    orderBy: (msg, { asc }) => [asc(msg.createdAt)],
  });

  return messages
    .map(
      (m) =>
        `[${m.direction}] From: ${m.fromName || m.fromEmail}\n${m.bodyText?.slice(0, 500) ?? ""}`,
    )
    .join("\n---\n");
}
