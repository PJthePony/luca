import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, participants, availabilityRules, userCalendars, meetingTypes } from "../db/schema.js";
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
  meetingTypeId?: string | null,
): Promise<ProposedSlot[]> {
  // Get organizer and their tokens
  const organizer = await db.query.users.findFirst({
    where: eq(users.id, organizerId),
  });
  if (!organizer?.googleTokens) {
    throw new Error("Organizer has no Google Calendar connected");
  }

  const tz = organizer.timezone || "America/New_York";

  // Get standing availability rules
  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.userId, organizerId),
  });

  // Get all participants with calendar access
  const meetingParticipants = await db.query.participants.findMany({
    where: eq(participants.meetingId, meetingId),
  });

  // Build calendar IDs for freeBusy query
  // Use userCalendars table if available, fall back to organizer email
  const orgCalendars = await db.query.userCalendars.findMany({
    where: eq(userCalendars.userId, organizerId),
  });

  const calendarIds: string[] = orgCalendars.length > 0
    ? orgCalendars
        .filter((c) => c.checkForConflicts)
        .map((c) => c.calendarId)
    : [organizer.email];

  // Also add participant calendars
  for (const p of meetingParticipants) {
    if (p.userId) {
      const pUser = await db.query.users.findFirst({
        where: eq(users.id, p.userId),
      });
      if (pUser?.googleTokens) {
        // Check if participant has synced calendars too
        const pCalendars = await db.query.userCalendars.findMany({
          where: eq(userCalendars.userId, p.userId),
        });
        if (pCalendars.length > 0) {
          calendarIds.push(
            ...pCalendars.filter((c) => c.checkForConflicts).map((c) => c.calendarId),
          );
        } else {
          calendarIds.push(pUser.email);
        }
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

  // Look up meeting type time constraints (e.g. coffee = 7:00–11:00)
  let typeTimeWindow: { earliest: string; latest: string } | undefined;
  if (meetingTypeId) {
    const mType = await db.query.meetingTypes.findFirst({
      where: eq(meetingTypes.id, meetingTypeId),
    });
    if (mType?.earliestTime || mType?.latestTime) {
      typeTimeWindow = {
        earliest: mType.earliestTime ?? "00:00",
        latest: mType.latestTime ?? "23:59",
      };
    }
  }

  // Generate candidate slots (timezone-aware)
  const candidates = generateCandidateSlots(
    now,
    searchEnd,
    durationMin,
    allBusy,
    rules,
    tz,
    typeTimeWindow,
  );

  // Score candidates
  const scored = candidates.map((slot) => ({
    ...slot,
    score: scoreSlot(slot, rules, timePreferences, now, tz),
  }));

  // Hard-filter by prefer preferences (ISO windows, then dayOfWeek)
  const filtered = applyHardFilter(scored, timePreferences, tz);

  // Sort by score descending
  filtered.sort((a, b) => b.score - a.score);

  // Apply diversity pass: spread across different days, enforce 2-hour gaps
  const diverse = applyDiversityPass(filtered, tz);
  return diverse.slice(0, 3);
}

/** Generate candidate slots that don't conflict with busy periods. */
function generateCandidateSlots(
  searchStart: Date,
  searchEnd: Date,
  durationMin: number,
  busy: { start: Date; end: Date }[],
  rules: (typeof availabilityRules.$inferSelect)[],
  tz: string,
  typeTimeWindow?: { earliest: string; latest: string },
): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = [];
  const durationMs = durationMin * 60 * 1000;

  // Start from tomorrow in the organizer's timezone
  const tomorrowLocal = getLocalDate(new Date(), tz);
  tomorrowLocal.setDate(tomorrowLocal.getDate() + 1);

  // Walk through each day in the search window
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const localDate = new Date(tomorrowLocal);
    localDate.setDate(localDate.getDate() + dayOffset);

    // Check if we're past the search end
    const dayStartUtc = localTimeToUtc(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 0, 0, tz);
    if (dayStartUtc > searchEnd) break;

    const dayOfWeek = localDate.getDay();

    // Find applicable availability rules for this day
    const dayRules = rules.filter(
      (r) => r.dayOfWeek === dayOfWeek && r.isActive,
    );

    // Skip weekends if no explicit rules
    if (dayRules.length === 0 && (dayOfWeek === 0 || dayOfWeek === 6)) {
      continue;
    }

    // If no rules, use default business hours (9am-5pm local time)
    const windows =
      dayRules.length > 0
        ? dayRules.map((r) => {
            const [sh, sm] = r.startTime.split(":").map(Number);
            const [eh, em] = r.endTime.split(":").map(Number);
            return {
              start: localTimeToUtc(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), sh, sm, tz),
              end: localTimeToUtc(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), eh, em, tz),
            };
          })
        : [
            {
              start: localTimeToUtc(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 9, 0, tz),
              end: localTimeToUtc(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 17, 0, tz),
            },
          ];

    // If meeting type has a time window, further constrain each availability window
    const constrainedWindows = typeTimeWindow
      ? windows.map((w) => {
          const [eh, em] = typeTimeWindow.earliest.split(":").map(Number);
          const [lh, lm] = typeTimeWindow.latest.split(":").map(Number);
          const typeStart = localTimeToUtc(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), eh, em, tz);
          const typeEnd = localTimeToUtc(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), lh, lm, tz);
          // Intersect: the later start and the earlier end
          const start = new Date(Math.max(w.start.getTime(), typeStart.getTime()));
          const end = new Date(Math.min(w.end.getTime(), typeEnd.getTime()));
          return { start, end };
        }).filter((w) => w.start < w.end) // drop empty intersections
      : windows;

    for (const window of constrainedWindows) {
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
  }

  return slots;
}

/** Score a slot based on preferences and proximity. */
function scoreSlot(
  slot: { start: Date; end: Date },
  rules: (typeof availabilityRules.$inferSelect)[],
  timePreferences: TimePreference[],
  now: Date,
  tz: string,
): number {
  let score = 100;

  // Get the local hour for this slot
  const localHour = getLocalHour(slot.start, tz);
  const localDayOfWeek = getLocalDayOfWeek(slot.start, tz);

  // Prefer slots within standing availability rules (+10)
  const dayRules = rules.filter(
    (r) => r.dayOfWeek === localDayOfWeek && r.isActive,
  );
  if (dayRules.length > 0) {
    score += 10;
  }

  // Prefer sooner times (+3 max for tomorrow, decreasing)
  const daysAway = Math.floor(
    (slot.start.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  score += Math.max(0, 3 - Math.floor(daysAway / 2));

  // Prefer mid-morning and early afternoon (+5) in local time
  if (localHour >= 10 && localHour <= 14) score += 5;

  // Apply email-stated time preferences
  for (const pref of timePreferences) {
    // ISO date overlap scoring (strongest signal)
    if (pref.start && pref.end) {
      const prefStart = new Date(pref.start);
      const prefEnd = new Date(pref.end);
      const overlaps = slot.start < prefEnd && slot.end > prefStart;

      if (pref.type === "prefer" && overlaps) score += 50;
      if (pref.type === "available" && overlaps) score += 30;
      if (pref.type === "avoid" && overlaps) score -= 100;
      if (pref.type === "unavailable" && overlaps) score -= 200;
    }

    // Day-of-week scoring (when no specific ISO dates, e.g. "I prefer Tuesdays")
    if (pref.dayOfWeek !== undefined && !pref.start) {
      if (pref.type === "prefer" && localDayOfWeek === pref.dayOfWeek) score += 40;
      if (pref.type === "avoid" && localDayOfWeek === pref.dayOfWeek) score -= 80;
    }
  }

  return score;
}

/**
 * Hard-filter scored slots based on "prefer" time preferences.
 * If the AI extracted specific ISO date windows or dayOfWeek preferences,
 * keep only slots that match. Falls back to all slots if the filter yields 0.
 */
function applyHardFilter(
  slots: ProposedSlot[],
  timePreferences: TimePreference[],
  tz: string,
): ProposedSlot[] {
  const preferPrefs = timePreferences.filter((p) => p.type === "prefer");
  if (preferPrefs.length === 0) return slots;

  // First: try filtering by ISO date windows
  const isoPrefs = preferPrefs.filter((p) => p.start && p.end);
  if (isoPrefs.length > 0) {
    const filtered = slots.filter((slot) =>
      isoPrefs.some((pref) => {
        const prefStart = new Date(pref.start!);
        const prefEnd = new Date(pref.end!);
        return slot.start < prefEnd && slot.end > prefStart;
      }),
    );
    if (filtered.length > 0) return filtered;
  }

  // Second: try filtering by dayOfWeek
  const dowPrefs = preferPrefs.filter((p) => p.dayOfWeek !== undefined);
  if (dowPrefs.length > 0) {
    const preferredDays = new Set(dowPrefs.map((p) => p.dayOfWeek!));
    const filtered = slots.filter((slot) => {
      const slotDow = getLocalDayOfWeek(slot.start, tz);
      return preferredDays.has(slotDow);
    });
    if (filtered.length > 0) return filtered;
  }

  // Fallback: return all slots (don't filter to nothing)
  return slots;
}

/**
 * Diversity pass: spread proposed slots across different days.
 * 1. Group scored slots by day (local date)
 * 2. Round-robin pick 1 per day (highest scoring from each day), cycle until 3
 * 3. Enforce 2-hour minimum gap between slots on the same day
 * 4. Backfill from top scores if fewer than 3
 */
function applyDiversityPass(
  slots: ProposedSlot[],
  tz: string,
): ProposedSlot[] {
  if (slots.length <= 3) return slots;

  const MIN_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours

  // Group by local date string
  const byDay = new Map<string, ProposedSlot[]>();
  for (const slot of slots) {
    const dateKey = getLocalDateString(slot.start, tz);
    if (!byDay.has(dateKey)) byDay.set(dateKey, []);
    byDay.get(dateKey)!.push(slot);
  }

  // Get days ordered by their best slot score
  const dayEntries = [...byDay.entries()].sort(
    (a, b) => b[1][0].score - a[1][0].score,
  );

  const result: ProposedSlot[] = [];
  const dayIndices = new Map<string, number>();
  for (const [day] of dayEntries) dayIndices.set(day, 0);

  // Round-robin: pick 1 from each day, cycle until we have 3
  let rounds = 0;
  while (result.length < 3 && rounds < 10) {
    for (const [day, daySlots] of dayEntries) {
      if (result.length >= 3) break;

      const idx = dayIndices.get(day)!;
      if (idx >= daySlots.length) continue;

      const candidate = daySlots[idx];
      dayIndices.set(day, idx + 1);

      // Enforce 2-hour gap with already-picked slots on the same day
      const sameDayPicks = result.filter(
        (r) => getLocalDateString(r.start, tz) === day,
      );
      const tooClose = sameDayPicks.some(
        (r) => Math.abs(candidate.start.getTime() - r.start.getTime()) < MIN_GAP_MS,
      );

      if (!tooClose) {
        result.push(candidate);
      } else {
        // Skip this one, try next from this day on next round
        // Advance index to find a non-conflicting slot
        let nextIdx = idx + 1;
        while (nextIdx < daySlots.length) {
          const alt = daySlots[nextIdx];
          const altTooClose = sameDayPicks.some(
            (r) => Math.abs(alt.start.getTime() - r.start.getTime()) < MIN_GAP_MS,
          );
          if (!altTooClose) {
            result.push(alt);
            dayIndices.set(day, nextIdx + 1);
            break;
          }
          nextIdx++;
        }
        if (nextIdx >= daySlots.length) {
          dayIndices.set(day, daySlots.length); // exhausted this day
        }
      }
    }
    rounds++;
  }

  // Backfill from top scores if we still don't have 3
  if (result.length < 3) {
    for (const slot of slots) {
      if (result.length >= 3) break;
      if (!result.includes(slot)) {
        result.push(slot);
      }
    }
  }

  return result;
}

/** Get a local date string key for grouping slots by day. */
function getLocalDateString(utcDate: Date, tz: string): string {
  return utcDate.toLocaleDateString("en-US", { timeZone: tz });
}

/**
 * Convert a local date/time in a given timezone to a UTC Date.
 * Uses Intl.DateTimeFormat to compute the offset.
 */
function localTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  // Create a date in UTC, then adjust by the timezone offset
  // First, make a rough UTC date
  const rough = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  // Get the offset at this point in the target timezone
  const offset = getTimezoneOffsetMs(rough, tz);
  // The local time "hour:minute" in tz corresponds to UTC time minus the offset
  return new Date(rough.getTime() - offset);
}

/**
 * Get the timezone offset in milliseconds (positive = ahead of UTC).
 * e.g., America/New_York in EST = -5h = -18000000ms
 */
function getTimezoneOffsetMs(date: Date, tz: string): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone: tz });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  return tzDate.getTime() - utcDate.getTime();
}

/** Get the local date components for a UTC date in a given timezone. */
function getLocalDate(utcDate: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(utcDate);

  const year = parseInt(parts.find(p => p.type === "year")!.value);
  const month = parseInt(parts.find(p => p.type === "month")!.value) - 1;
  const day = parseInt(parts.find(p => p.type === "day")!.value);

  return new Date(year, month, day);
}

/** Get the local hour for a UTC date in a given timezone. */
function getLocalHour(utcDate: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(utcDate);
  return parseInt(parts.find(p => p.type === "hour")!.value);
}

/** Get the local day of week for a UTC date in a given timezone. */
function getLocalDayOfWeek(utcDate: Date, tz: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  });
  const weekday = formatter.format(utcDate);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}
