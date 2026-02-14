import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  meetings,
  emailThreads,
  emailMessages,
  users,
  availabilityRules,
  proposedSlots,
} from "../db/schema.js";
import { parseEmail } from "../lib/claude.js";
import type { ParsedEmail } from "../types/index.js";

/**
 * Parse an inbound email using Claude, enriched with meeting context.
 */
export async function parseInboundEmail(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  meetingId: string,
  organizerId: string,
): Promise<ParsedEmail> {
  // Get organizer info
  const organizer = await db.query.users.findFirst({
    where: eq(users.id, organizerId),
  });
  if (!organizer) throw new Error("Organizer not found");

  // Get meeting state
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });

  // Get thread history for context
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

  // Get proposed times if in PROPOSED state
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

  // Get availability preferences
  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.userId, organizerId),
  });
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const availabilityPreferences = rules
    .filter((r) => r.isActive)
    .map((r) => `${days[r.dayOfWeek]}: ${r.startTime} - ${r.endTime}`)
    .join(", ");

  // Get existing agenda items for context
  const existingAgenda = (meeting?.agenda as string[]) ?? [];

  return parseEmail(emailBody, senderEmail, senderName, subject, {
    organizerName: organizer.name,
    organizerEmail: organizer.email,
    organizerTimezone: organizer.timezone,
    meetingStatus: meeting?.status,
    proposedTimes,
    threadHistory: threadHistory || undefined,
    availabilityPreferences: availabilityPreferences || undefined,
    existingAgenda: existingAgenda.length > 0 ? existingAgenda : undefined,
  });
}
