import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, proposedSlots, participants, meetingTypes, users } from "../db/schema.js";
import { MeetingStatus } from "../types/index.js";
import type { GoogleTokens } from "../types/index.js";
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

/** Look up the organizer's work email (if configured). */
async function getWorkEmail(organizerId: string): Promise<string | null> {
  const organizer = await db.query.users.findFirst({
    where: eq(users.id, organizerId),
    columns: { workEmail: true },
  });
  return organizer?.workEmail ?? null;
}

/**
 * Transition a meeting to PROPOSED state.
 * Creates tentative calendar holds for each proposed slot.
 */
export async function proposeTimes(
  meetingId: string,
  slots: { start: Date; end: Date; meetingTypeId?: string }[],
  organizerTokens: GoogleTokens,
  meetingTitle: string,
  description?: string,
  options?: { addGoogleMeet?: boolean; location?: string; timeZone?: string },
): Promise<{ slots: typeof proposedSlots.$inferSelect[]; meetLink?: string }> {
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

    // Look up organizer email and work email
    const organizer = await db.query.users.findFirst({
      where: eq(users.id, meeting.organizerId),
    });
    const organizerEmail = organizer?.email ?? "";
    const workEmail = await getWorkEmail(meeting.organizerId);

    // Create tentative calendar holds
    const createdSlots: (typeof proposedSlots.$inferSelect)[] = [];
    let meetLink: string | undefined;

    for (const slot of slots) {
      const result = await gcal.createTentativeEvent(organizerTokens, {
        summary: `[Tentative] ${meetingTitle}`,
        start: slot.start,
        end: slot.end,
        organizerEmail,
        description,
        addGoogleMeet: options?.addGoogleMeet,
        location: options?.location,
        timeZone: options?.timeZone,
      });

      if (result.meetLink && !meetLink) {
        meetLink = result.meetLink;
      }

      // Create work calendar busy hold if configured
      let workBusyId: string | undefined;
      if (workEmail) {
        try {
          workBusyId = await gcal.createBusyHold(organizerTokens, {
            start: slot.start,
            end: slot.end,
            workEmail,
            timeZone: options?.timeZone,
          });
        } catch (err) {
          console.warn("Failed to create work calendar busy hold:", err);
        }
      }

      const [created] = await tx
        .insert(proposedSlots)
        .values({
          meetingId,
          startTime: slot.start,
          endTime: slot.end,
          meetingTypeId: slot.meetingTypeId ?? null,
          tentativeEventIds: {
            primary: result.eventId,
            ...(workBusyId ? { workBusy: workBusyId } : {}),
          },
        })
        .returning();

      createdSlots.push(created);
    }

    // Transition to PROPOSED
    await tx
      .update(meetings)
      .set({ status: MeetingStatus.PROPOSED, updatedAt: new Date() })
      .where(eq(meetings.id, meetingId));

    return { slots: createdSlots, meetLink };
  });
}

/**
 * Append additional proposed slots to a meeting already in PROPOSED state.
 * Creates tentative calendar holds for the new slots; leaves existing slots in place.
 */
export async function appendProposedSlots(
  meetingId: string,
  slots: { start: Date; end: Date; meetingTypeId?: string }[],
  organizerTokens: GoogleTokens,
  meetingTitle: string,
  description?: string,
  options?: { addGoogleMeet?: boolean; location?: string; timeZone?: string },
): Promise<typeof proposedSlots.$inferSelect[]> {
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .for("update");

    if (meeting.status !== MeetingStatus.PROPOSED) {
      throw new Error(
        `Cannot append slots: meeting is ${meeting.status}, expected ${MeetingStatus.PROPOSED}`,
      );
    }

    const organizer = await db.query.users.findFirst({
      where: eq(users.id, meeting.organizerId),
    });
    const organizerEmail = organizer?.email ?? "";
    const workEmail = await getWorkEmail(meeting.organizerId);

    const createdSlots: (typeof proposedSlots.$inferSelect)[] = [];

    for (const slot of slots) {
      const result = await gcal.createTentativeEvent(organizerTokens, {
        summary: `[Tentative] ${meetingTitle}`,
        start: slot.start,
        end: slot.end,
        organizerEmail,
        description,
        addGoogleMeet: options?.addGoogleMeet,
        location: options?.location,
        timeZone: options?.timeZone,
      });

      let workBusyId: string | undefined;
      if (workEmail) {
        try {
          workBusyId = await gcal.createBusyHold(organizerTokens, {
            start: slot.start,
            end: slot.end,
            workEmail,
            timeZone: options?.timeZone,
          });
        } catch (err) {
          console.warn("Failed to create work calendar busy hold:", err);
        }
      }

      const [created] = await tx
        .insert(proposedSlots)
        .values({
          meetingId,
          startTime: slot.start,
          endTime: slot.end,
          meetingTypeId: slot.meetingTypeId ?? null,
          tentativeEventIds: {
            primary: result.eventId,
            ...(workBusyId ? { workBusy: workBusyId } : {}),
          },
        })
        .returning();

      createdSlots.push(created);
    }

    await tx
      .update(meetings)
      .set({ updatedAt: new Date() })
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
  organizerTokens: GoogleTokens,
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

    // Get attendee emails for the calendar invite
    const meetingParticipants = await tx
      .select()
      .from(participants)
      .where(eq(participants.meetingId, meetingId));
    const attendeeEmails = meetingParticipants.map((p) => p.email);

    // Build description from meeting context + agenda
    let description = meeting.notes ?? "";
    const agenda = (meeting.agenda as string[]) ?? [];
    if (agenda.length > 0) {
      description += (description ? "\n\n" : "") + "Agenda:\n" + agenda.map((a) => `- ${a}`).join("\n");
    }

    // Resolve meeting type — prefer the slot's type (for multi-type meetings),
    // fall back to the meeting's type
    const resolvedTypeId = selectedSlot.meetingTypeId ?? meeting.meetingTypeId;
    let isVideoCall = false;
    let location = meeting.location ?? undefined;
    if (resolvedTypeId) {
      const mType = await tx.query.meetingTypes.findFirst({
        where: eq(meetingTypes.id, resolvedTypeId),
      });
      if (mType) {
        if (mType.addGoogleMeet) {
          isVideoCall = true;
        }
        if (!location && mType.defaultLocation) {
          location = mType.defaultLocation;
        }
      }
    }

    // Get organizer timezone
    const organizer = await tx.query.users.findFirst({
      where: eq(users.id, meeting.organizerId),
    });
    const tz = organizer?.timezone ?? "America/New_York";

    // Confirm the selected slot's calendar event
    const eventIds = selectedSlot.tentativeEventIds as Record<string, string>;
    if (eventIds?.primary) {
      await gcal.confirmEvent(
        organizerTokens,
        eventIds.primary,
        attendeeEmails,
        description || undefined,
        location,
        isVideoCall,
        tz,
        organizer?.email,
      );
    }

    // Delete unselected tentative events (and their work busy holds)
    for (const slot of allSlots) {
      if (slot.id === slotId) continue;
      const ids = slot.tentativeEventIds as Record<string, string>;
      if (ids?.primary) {
        try {
          console.log(`Deleting tentative event ${ids.primary} for unselected slot`);
          await gcal.deleteEvent(organizerTokens, ids.primary);
        } catch (err) {
          console.warn(`Failed to delete tentative event ${ids.primary}:`, err);
        }
      }
      if (ids?.workBusy) {
        try {
          await gcal.deleteEvent(organizerTokens, ids.workBusy);
        } catch (err) {
          console.warn(`Failed to delete work busy hold ${ids.workBusy}:`, err);
        }
      }
    }

    // Mark selected slot
    await tx
      .update(proposedSlots)
      .set({ isSelected: true })
      .where(eq(proposedSlots.id, slotId));

    // Transition to CONFIRMED — set meetingTypeId from the slot's type
    await tx
      .update(meetings)
      .set({
        status: MeetingStatus.CONFIRMED,
        confirmedStart: selectedSlot.startTime,
        confirmedEnd: selectedSlot.endTime,
        googleEventId: eventIds?.primary,
        ...(resolvedTypeId ? { meetingTypeId: resolvedTypeId } : {}),
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
  organizerTokens: GoogleTokens,
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

    // Delete all tentative events (and work busy holds) for existing slots
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
      if (ids?.workBusy) {
        try {
          await gcal.deleteEvent(organizerTokens, ids.workBusy);
        } catch {
          // Event may have already been deleted
        }
      }
    }

    // Delete old proposed slots from the database
    await tx
      .delete(proposedSlots)
      .where(eq(proposedSlots.meetingId, meetingId));

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
  organizerTokens: GoogleTokens,
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

    // Delete tentative events and work busy holds
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
      if (ids?.workBusy) {
        try {
          await gcal.deleteEvent(organizerTokens, ids.workBusy);
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
