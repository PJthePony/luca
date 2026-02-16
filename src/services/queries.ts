import { eq, desc, count as dbCount } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  users,
  meetings,
  participants,
  proposedSlots,
  emailThreads,
  emailMessages,
  userCalendars,
  meetingTypes,
  meetingLocations,
  availabilityRules,
} from "../db/schema.js";

// ── Shared Types ─────────────────────────────────────────────────────────────

export interface MeetingData {
  meeting: typeof meetings.$inferSelect;
  participants: (typeof participants.$inferSelect)[];
  slots: (typeof proposedSlots.$inferSelect)[];
  thread: typeof emailThreads.$inferSelect | null | undefined;
  messageCount: number;
  meetingType: typeof meetingTypes.$inferSelect | null;
}

export type MeetingTypeWithLocations = typeof meetingTypes.$inferSelect & {
  locations: (typeof meetingLocations.$inferSelect)[];
};

export interface SettingsData {
  calendars: (typeof userCalendars.$inferSelect)[];
  types: MeetingTypeWithLocations[];
  rules: (typeof availabilityRules.$inferSelect)[];
}

// ── Query Helpers ────────────────────────────────────────────────────────────

/** Fetch meetings with all related data (participants, slots, thread, message count, meeting type). */
export async function fetchMeetingsData(
  userId: string,
  limit: number,
  offset: number = 0,
): Promise<MeetingData[]> {
  const userMeetings = await db.query.meetings.findMany({
    where: eq(meetings.organizerId, userId),
    orderBy: [desc(meetings.updatedAt)],
    limit,
    offset,
  });

  return Promise.all(
    userMeetings.map(async (m) => {
      const [parts, slots, thread] = await Promise.all([
        db.query.participants.findMany({
          where: eq(participants.meetingId, m.id),
        }),
        db.query.proposedSlots.findMany({
          where: eq(proposedSlots.meetingId, m.id),
        }),
        db.query.emailThreads.findFirst({
          where: eq(emailThreads.meetingId, m.id),
        }),
      ]);

      let messageCount = 0;
      if (thread) {
        const [{ total }] = await db
          .select({ total: dbCount() })
          .from(emailMessages)
          .where(eq(emailMessages.threadId, thread.id));
        messageCount = total;
      }

      let meetingType: typeof meetingTypes.$inferSelect | null = null;
      if (m.meetingTypeId) {
        meetingType =
          (await db.query.meetingTypes.findFirst({
            where: eq(meetingTypes.id, m.meetingTypeId),
          })) ?? null;
      }

      return { meeting: m, participants: parts, slots, thread, messageCount, meetingType };
    }),
  );
}

/** Fetch settings data (calendars, meeting types with locations, availability rules) for a user. */
export async function fetchSettingsData(userId: string): Promise<SettingsData> {
  const calendars = await db.query.userCalendars.findMany({
    where: eq(userCalendars.userId, userId),
  });

  const types = await db.query.meetingTypes.findMany({
    where: eq(meetingTypes.userId, userId),
  });

  const typesWithLocations = await Promise.all(
    types.map(async (t) => {
      const locations = t.isOnline
        ? []
        : await db.query.meetingLocations.findMany({
            where: eq(meetingLocations.meetingTypeId, t.id),
            orderBy: (loc, { asc }) => [asc(loc.sortOrder)],
          });
      return { ...t, locations };
    }),
  );

  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.userId, userId),
  });

  return { calendars, types: typesWithLocations, rules };
}

/** Get attendee (non-organizer) email addresses for a meeting. */
export async function getAttendeeEmails(meetingId: string): Promise<string[]> {
  const allParticipants = await db.query.participants.findMany({
    where: eq(participants.meetingId, meetingId),
  });
  return allParticipants
    .filter((p) => p.role !== "organizer")
    .map((p) => p.email);
}

/** Check if a meeting type is a video call (needs Google Meet). */
export async function isVideoCallType(meetingTypeId: string | null | undefined): Promise<boolean> {
  if (!meetingTypeId) return false;
  const mType = await db.query.meetingTypes.findFirst({
    where: eq(meetingTypes.id, meetingTypeId),
  });
  return !!(mType?.slug === "video_call" && mType?.isOnline);
}
