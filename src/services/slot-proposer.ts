import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, participants, availabilityRules } from "../db/schema.js";
import * as gcal from "../lib/google.js";
import type { TimePreference } from "../types/index.js";

interface ProposedSlot {
  start: Date;
  end: Date;
  score: number;
}

/**
 * Find and score available time slots for a meeting.
 *
 * Scoring priority:
 * 1. Number of participants confirmed free (from freeBusy)
 * 2. Alignment with organizer's standing availability preferences
 * 3. Alignment with email-stated time preferences
 * 4. Nearness to today (prefer sooner)
 */
export async function findAvailableSlots(
  organizerId: string,
  meetingId: string,
  durationMin: number,
  timePreferences: TimePreference[],
  searchDays: number = 10,
): Promise<ProposedSlot[]> {
  // Get organizer and their tokens
  const organizer = await db.query.users.findFirst({
    where: eq(users.id, organizerId),
  });
  if (!organizer?.googleTokens) {
    throw new Error("Organizer has no Google Calendar connected");
  }

  // Get standing availability rules
  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.userId, organizerId),
  });

  // Get all participants with calendar access
  const meetingParticipants = await db.query.participants.findMany({
    where: eq(participants.meetingId, meetingId),
  });

  // Build calendar IDs for freeBusy query
  const calendarIds = [organizer.email];
  const participantTokens: Record<
    string,
    { access_token?: string | null; refresh_token?: string | null }
  > = {};

  for (const p of meetingParticipants) {
    if (p.userId) {
      const pUser = await db.query.users.findFirst({
        where: eq(users.id, p.userId),
      });
      if (pUser?.googleTokens) {
        calendarIds.push(pUser.email);
      }
    }
  }

  // Query free/busy for the search window
  const now = new Date();
  const searchEnd = new Date(
    now.getTime() + searchDays * 24 * 60 * 60 * 1000,
  );

  const freeBusyResults = await gcal.queryFreeBusy(
    organizer.googleTokens as {
      access_token?: string | null;
      refresh_token?: string | null;
    },
    calendarIds,
    now,
    searchEnd,
  );

  // Merge all busy periods
  const allBusy = freeBusyResults.flatMap((r) =>
    r.busy.map((b) => ({
      start: new Date(b.start),
      end: new Date(b.end),
    })),
  );

  // Generate candidate slots
  const candidates = generateCandidateSlots(
    now,
    searchEnd,
    durationMin,
    allBusy,
    rules,
  );

  // Score candidates
  const scored = candidates.map((slot) => ({
    ...slot,
    score: scoreSlot(slot, rules, timePreferences, now),
  }));

  // Sort by score descending, take top 3
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

/** Generate candidate slots that don't conflict with busy periods. */
function generateCandidateSlots(
  searchStart: Date,
  searchEnd: Date,
  durationMin: number,
  busy: { start: Date; end: Date }[],
  rules: (typeof availabilityRules.$inferSelect)[],
): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = [];
  const durationMs = durationMin * 60 * 1000;

  // Walk through each day in the search window
  const current = new Date(searchStart);
  current.setHours(0, 0, 0, 0);
  current.setDate(current.getDate() + 1); // Start from tomorrow

  while (current < searchEnd) {
    const dayOfWeek = current.getDay();

    // Find applicable availability rules for this day
    const dayRules = rules.filter(
      (r) => r.dayOfWeek === dayOfWeek && r.isActive,
    );

    // If no rules, use default business hours (9am-5pm)
    const windows =
      dayRules.length > 0
        ? dayRules.map((r) => ({
            start: parseTime(r.startTime, current),
            end: parseTime(r.endTime, current),
          }))
        : [
            {
              start: setTime(current, 9, 0),
              end: setTime(current, 17, 0),
            },
          ];

    // Skip weekends if no explicit rules
    if (dayRules.length === 0 && (dayOfWeek === 0 || dayOfWeek === 6)) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    for (const window of windows) {
      // Generate slots at 30-min intervals within this window
      let slotStart = new Date(window.start);
      while (slotStart.getTime() + durationMs <= window.end.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durationMs);

        // Check for conflicts with busy periods
        const hasConflict = busy.some(
          (b) => slotStart < b.end && slotEnd > b.start,
        );

        if (!hasConflict && slotStart > searchStart) {
          slots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
        }

        slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000);
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

/** Score a slot based on preferences and proximity. */
function scoreSlot(
  slot: { start: Date; end: Date },
  rules: (typeof availabilityRules.$inferSelect)[],
  timePreferences: TimePreference[],
  now: Date,
): number {
  let score = 100;

  // Prefer slots within standing availability rules (+20)
  const dayRules = rules.filter(
    (r) => r.dayOfWeek === slot.start.getDay() && r.isActive,
  );
  if (dayRules.length > 0) {
    score += 20;
  }

  // Prefer sooner times (+10 for tomorrow, decreasing)
  const daysAway = Math.floor(
    (slot.start.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  score += Math.max(0, 10 - daysAway);

  // Prefer mid-morning and early afternoon (+5)
  const hour = slot.start.getHours();
  if (hour >= 10 && hour <= 14) score += 5;

  // Apply email-stated time preferences
  for (const pref of timePreferences) {
    if (pref.start && pref.end) {
      const prefStart = new Date(pref.start);
      const prefEnd = new Date(pref.end);
      const overlaps = slot.start < prefEnd && slot.end > prefStart;

      if (pref.type === "prefer" && overlaps) score += 15;
      if (pref.type === "avoid" && overlaps) score -= 30;
      if (pref.type === "unavailable" && overlaps) score -= 100;
    }
  }

  return score;
}

function parseTime(timeStr: string, date: Date): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return setTime(date, hours, minutes);
}

function setTime(date: Date, hours: number, minutes: number): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}
