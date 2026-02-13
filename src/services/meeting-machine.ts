import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, proposedSlots, participants } from "../db/schema.js";
import { MeetingStatus } from "../types/index.js";
import * as gcal from "../lib/google.js";

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  [MeetingStatus.DRAFT]: [MeetingStatus.PROPOSED, MeetingStatus.CANCELLED],
  [MeetingStatus.PROPOSED]: [
    MeetingStatus.CONFIRMED,
    MeetingStatus.CANCELLED,
    MeetingStatus.RESCHEDULING,
  ],
  [MeetingStatus.CONFIRMED]: [
    MeetingStatus.RESCHEDULING,
    MeetingStatus.CANCELLED,
  ],
  [MeetingStatus.RESCHEDULING]: [
    MeetingStatus.PROPOSED,
    MeetingStatus.CANCELLED,
  ],
  [MeetingStatus.CANCELLED]: [],
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Transition a meeting to PROPOSED state.
 * Creates tentative calendar holds for each proposed slot.
 */
export async function proposeTimes(
  meetingId: string,
  slots: { start: Date; end: Date }[],
  organizerTokens: { access_token?: string | null; refresh_token?: string | null },
  meetingTitle: string,
): Promise<typeof proposedSlots.$inferSelect[]> {
  return await db.transaction(async (tx) => {
    // Lock the meeting row
    const [meeting] = await tx
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .for("update");

    if (
      !isValidTransition(meeting.status, MeetingStatus.PROPOSED) &&
      meeting.status !== MeetingStatus.RESCHEDULING
    ) {
      throw new Error(
        `Cannot propose times: invalid transition from ${meeting.status}`,
      );
    }

    // Create tentative calendar holds
    const createdSlots: (typeof proposedSlots.$inferSelect)[] = [];

    for (const slot of slots) {
      const eventId = await gcal.createTentativeEvent(organizerTokens, {
        summary: `[Tentative] ${meetingTitle}`,
        start: slot.start,
        end: slot.end,
      });

      const [created] = await tx
        .insert(proposedSlots)
        .values({
          meetingId,
          startTime: slot.start,
          endTime: slot.end,
          tentativeEventIds: { primary: eventId },
        })
        .returning();

      createdSlots.push(created);
    }

    // Transition to PROPOSED
    await tx
      .update(meetings)
      .set({ status: MeetingStatus.PROPOSED, updatedAt: new Date() })
      .where(eq(meetings.id, meetingId));

    return createdSlots;
  });
}

/**
 * Confirm a specific time slot.
 * Confirms the selected calendar event and deletes the others.
 */
export async function confirmSlot(
  meetingId: string,
  slotId: string,
  organizerTokens: { access_token?: string | null; refresh_token?: string | null },
): Promise<typeof proposedSlots.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .for("update");

    if (!isValidTransition(meeting.status, MeetingStatus.CONFIRMED)) {
      throw new Error(
        `Cannot confirm: invalid transition from ${meeting.status}`,
      );
    }

    // Get all proposed slots
    const allSlots = await tx
      .select()
      .from(proposedSlots)
      .where(eq(proposedSlots.meetingId, meetingId));

    const selectedSlot = allSlots.find((s) => s.id === slotId);
    if (!selectedSlot) {
      throw new Error(`Slot ${slotId} not found for meeting ${meetingId}`);
    }

    // Confirm the selected slot's calendar event
    const eventIds = selectedSlot.tentativeEventIds as Record<string, string>;
    if (eventIds?.primary) {
      await gcal.confirmEvent(organizerTokens, eventIds.primary);
    }

    // Delete unselected tentative events
    for (const slot of allSlots) {
      if (slot.id === slotId) continue;
      const ids = slot.tentativeEventIds as Record<string, string>;
      if (ids?.primary) {
        try {
          await gcal.deleteEvent(organizerTokens, ids.primary);
        } catch {
          // Event may have already been deleted
        }
      }
    }

    // Mark selected slot
    await tx
      .update(proposedSlots)
      .set({ isSelected: true })
      .where(eq(proposedSlots.id, slotId));

    // Transition to CONFIRMED
    await tx
      .update(meetings)
      .set({
        status: MeetingStatus.CONFIRMED,
        confirmedStart: selectedSlot.startTime,
        confirmedEnd: selectedSlot.endTime,
        googleEventId: eventIds?.primary,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    return selectedSlot;
  });
}

/**
 * Start the rescheduling flow.
 * Releases all existing tentative holds.
 */
export async function startRescheduling(
  meetingId: string,
  organizerTokens: { access_token?: string | null; refresh_token?: string | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .for("update");

    if (!isValidTransition(meeting.status, MeetingStatus.RESCHEDULING)) {
      throw new Error(
        `Cannot reschedule: invalid transition from ${meeting.status}`,
      );
    }

    // Delete confirmed event if exists
    if (meeting.googleEventId) {
      try {
        await gcal.deleteEvent(organizerTokens, meeting.googleEventId);
      } catch {
        // Event may have already been deleted
      }
    }

    // Delete all tentative events for existing slots
    const slots = await tx
      .select()
      .from(proposedSlots)
      .where(eq(proposedSlots.meetingId, meetingId));

    for (const slot of slots) {
      const ids = slot.tentativeEventIds as Record<string, string>;
      if (ids?.primary) {
        try {
          await gcal.deleteEvent(organizerTokens, ids.primary);
        } catch {
          // Event may have already been deleted
        }
      }
    }

    // Transition to RESCHEDULING
    await tx
      .update(meetings)
      .set({
        status: MeetingStatus.RESCHEDULING,
        confirmedStart: null,
        confirmedEnd: null,
        googleEventId: null,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));
  });
}

/**
 * Cancel a meeting. Releases all calendar holds.
 */
export async function cancelMeeting(
  meetingId: string,
  organizerTokens: { access_token?: string | null; refresh_token?: string | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .for("update");

    if (!isValidTransition(meeting.status, MeetingStatus.CANCELLED)) {
      throw new Error(
        `Cannot cancel: invalid transition from ${meeting.status}`,
      );
    }

    // Delete confirmed event
    if (meeting.googleEventId) {
      try {
        await gcal.deleteEvent(organizerTokens, meeting.googleEventId);
      } catch {}
    }

    // Delete tentative events
    const slots = await tx
      .select()
      .from(proposedSlots)
      .where(eq(proposedSlots.meetingId, meetingId));

    for (const slot of slots) {
      const ids = slot.tentativeEventIds as Record<string, string>;
      if (ids?.primary) {
        try {
          await gcal.deleteEvent(organizerTokens, ids.primary);
        } catch {}
      }
    }

    await tx
      .update(meetings)
      .set({
        status: MeetingStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));
  });
}
