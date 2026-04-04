import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, meetingLocations, meetingTypes, participants, proposedSlots } from "../db/schema.js";
import { sendThreadedReply } from "./email.js";
import { findAvailableSlots } from "./slot-proposer.js";
import * as machine from "./meeting-machine.js";
import { notifyUser } from "./notification.js";
import { getAttendeeEmails, isVideoCallType } from "./queries.js";
import type { ExtractedData, ComposerContext, IntentHandlerResult } from "../types/index.js";
import type { GoogleTokens } from "../types/index.js";
import { env } from "../config.js";

// ── Shared Helpers ──────────────────────────────────────────────────────────

/** Format a date/time range in a given timezone for display in emails. */
export function formatSlot(start: Date, end: Date, tz: string): string {
  const date = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${date} at ${startTime} - ${endTime}`;
}

/** Build a calendar event description from context summary + agenda. */
export function buildCalendarDescription(
  contextSummary: string | null | undefined,
  agenda: string[],
): string | undefined {
  const parts: string[] = [];
  if (contextSummary) parts.push(contextSummary);
  if (agenda.length > 0) {
    parts.push("Agenda:\n" + agenda.map((a) => `- ${a}`).join("\n"));
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function formatTime(date: Date, tz: string): string {
  const d = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const t = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${d} at ${t}`;
}

// ── Shared Context ──────────────────────────────────────────────────────────

export interface IntentContext {
  meeting: typeof meetings.$inferSelect;
  thread: { id: string; subject: string };
  organizer: { id: string; name: string; email: string; timezone: string; googleTokens: unknown };
  tz: string;
  tokens: GoogleTokens | null;
  replyTo: string[];
  extracted: ExtractedData;
  calendarDescription: string | undefined;
  emailSubject: string;
}

// ── Intent Handlers (return ComposerContext, no email sending) ─────────────

export async function handleScheduleNew(ctx: IntentContext): Promise<IntentHandlerResult> {
  const { meeting, thread, organizer, tz, tokens, replyTo, extracted, calendarDescription, emailSubject } = ctx;

  if (!tokens) {
    return {
      composerContext: { intent: "schedule_new", organizerName: organizer.name },
      skipPipeline: true,
      fixedMessage: `Hi ${organizer.name}, I'd love to help schedule this meeting, but I don't have access to your Google Calendar yet. Please connect it at ${env.APP_URL}/auth/google?userId=${organizer.id}\n\n- Luca`,
      fixedTo: [organizer.email],
    };
  }

  // Resolve meeting type from AI inference
  let effectiveDuration = extracted.meeting_details.duration_minutes ?? 30;
  const aiMeetingTypeId = extracted.meeting_details.meeting_type_id;
  let matchedTypeId: string | undefined;

  // Get participant names for title building
  const allParticipants = await db.query.participants.findMany({
    where: eq(participants.meetingId, meeting.id),
  });

  if (aiMeetingTypeId) {
    let matchedType = await db.query.meetingTypes.findFirst({
      where: and(
        eq(meetingTypes.id, aiMeetingTypeId),
        eq(meetingTypes.userId, organizer.id),
      ),
    });

    if (!matchedType) {
      matchedType = await db.query.meetingTypes.findFirst({
        where: and(
          eq(meetingTypes.userId, organizer.id),
          eq(meetingTypes.isDefault, true),
        ),
      }) ?? undefined;
    }

    if (matchedType) {
      matchedTypeId = matchedType.id;
      if (!extracted.meeting_details.duration_minutes) {
        effectiveDuration = matchedType.defaultDuration;
      }

      const participantNames = allParticipants
        .filter((p) => p.role !== "organizer")
        .map((p) => {
          if (p.name) return p.name.split(/\s+/)[0];
          return p.email.split("@")[0];
        });
      const allNames = [organizer.name.split(/\s+/)[0], ...participantNames];
      const nameList = allNames.length <= 2
        ? allNames.join(" and ")
        : allNames.slice(0, -1).join(", ") + " and " + allNames[allNames.length - 1];
      const meetingTitle = `${matchedType.name} for ${nameList}`;

      const meetingUpdate: Record<string, unknown> = {
        meetingTypeId: matchedType.id,
        durationMin: effectiveDuration,
        title: meetingTitle,
        updatedAt: new Date(),
      };
      if (matchedType.defaultLocation) {
        meetingUpdate.location = matchedType.defaultLocation;
      }
      await db
        .update(meetings)
        .set(meetingUpdate)
        .where(eq(meetings.id, meeting.id));

      meeting.title = meetingTitle;
    }
  }

  // Build a fallback title if none was set by meeting type
  if (!meeting.title) {
    const participantNames = allParticipants
      .filter((p) => p.role !== "organizer")
      .map((p) => {
        if (p.name) return p.name.split(/\s+/)[0];
        return p.email.split("@")[0];
      });
    const allNames = [organizer.name.split(/\s+/)[0], ...participantNames];
    const nameList = allNames.length <= 2
      ? allNames.join(" and ")
      : allNames.slice(0, -1).join(", ") + " and " + allNames[allNames.length - 1];
    const fallbackTitle = `Meeting for ${nameList}`;
    meeting.title = fallbackTitle;
    await db
      .update(meetings)
      .set({ title: fallbackTitle, updatedAt: new Date() })
      .where(eq(meetings.id, meeting.id));
  }

  // Find available slots
  const slots = await findAvailableSlots(
    organizer.id,
    meeting.id,
    effectiveDuration,
    extracted.time_preferences,
    10,
    matchedTypeId,
  );

  if (slots.length === 0) {
    return {
      composerContext: {
        intent: "schedule_new",
        meetingTitle: meeting.title ?? emailSubject,
        organizerName: organizer.name,
        participantNames: allParticipants.filter((p) => p.role !== "organizer").map((p) => p.name ?? p.email.split("@")[0]),
        noSlotsMessage: `I wasn't able to find any available times in the next 10 days. Could you share some times that work for you?`,
        pickerLink: `${env.APP_URL}/meeting/${meeting.shortId}`,
      },
    };
  }

  // Determine meeting type features
  const resolvedType = matchedTypeId
    ? (await db.query.meetingTypes.findFirst({
        where: eq(meetingTypes.id, matchedTypeId),
      })) ?? undefined
    : undefined;

  const isVideoCall = resolvedType?.addGoogleMeet ?? false;
  const isPhoneCall = resolvedType?.collectPhoneNumber ?? false;

  // Create tentative holds and transition to PROPOSED
  const proposeResult = await machine.proposeTimes(
    meeting.id,
    slots.map((s) => ({ start: s.start, end: s.end })),
    tokens,
    meeting.title ?? emailSubject,
    calendarDescription,
    {
      addGoogleMeet: isVideoCall,
      location: resolvedType?.defaultLocation ?? undefined,
      timeZone: tz,
    },
  );

  // Format slots for composer
  const formattedSlots = proposeResult.slots
    .map((s, i) => `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`)
    .join("\n");

  const agendaAck = extracted.agenda_items && extracted.agenda_items.length > 0
    ? "I've noted the discussion topics for the agenda."
    : undefined;

  // Check for in-person location options
  let locationOptions: string | undefined;
  let pickerLink = `${env.APP_URL}/meeting/${meeting.shortId}`;
  if (resolvedType && !resolvedType.isOnline) {
    const locations = await db.query.meetingLocations.findMany({
      where: eq(meetingLocations.meetingTypeId, resolvedType.id),
      orderBy: (loc, { asc }) => [asc(loc.sortOrder)],
    });
    if (locations.length > 0) {
      locationOptions = locations.map((l) => `- ${l.name}${l.address ? ` (${l.address})` : ""}`).join("\n");
    }
  }

  let meetNote: string | undefined;
  if (isVideoCall && proposeResult.meetLink) {
    meetNote = "A Google Meet link will be included in the calendar invite.";
  }

  let phoneNote: string | undefined;
  if (isPhoneCall) {
    phoneNote = `Since this is a phone call, could you share your phone number? ${organizer.name} will call you at the selected time.`;
  }

  return {
    composerContext: {
      intent: "schedule_new",
      formattedSlots,
      pickerLink,
      locationOptions,
      meetNote,
      phoneNote,
      agendaAck,
      meetingTitle: meeting.title ?? emailSubject,
      organizerName: organizer.name,
      participantNames: allParticipants.filter((p) => p.role !== "organizer").map((p) => p.name ?? p.email.split("@")[0]),
    },
  };
}

export async function handleConfirmTime(ctx: IntentContext): Promise<IntentHandlerResult> {
  const { meeting, thread, organizer, tz, tokens, replyTo, extracted } = ctx;
  if (!tokens || !extracted.selected_time) {
    return {
      composerContext: { intent: "confirm_time" },
      skipPipeline: true,
      fixedMessage: "I couldn't process that confirmation. Please try again.\n\n- Luca",
      fixedTo: replyTo,
      fixedBcc: [organizer.email],
    };
  }

  const meetingSlots = await db.query.proposedSlots.findMany({
    where: eq(proposedSlots.meetingId, meeting.id),
  });

  const selectedStart = new Date(extracted.selected_time.start);
  const matchedSlot = meetingSlots.find(
    (s) => Math.abs(s.startTime.getTime() - selectedStart.getTime()) < 30 * 60 * 1000,
  );

  if (matchedSlot) {
    await machine.confirmSlot(meeting.id, matchedSlot.id, tokens);
    const confirmedTime = formatTime(matchedSlot.startTime, tz);

    await notifyUser({
      type: "meeting_confirmed",
      userId: organizer.id,
      meetingTitle: meeting.title ?? "Meeting",
      meetingShortId: meeting.shortId,
      confirmedTime,
    });

    return {
      composerContext: {
        intent: "confirm_time",
        confirmedTime,
        rescheduleLink: `${env.APP_URL}/meeting/${meeting.shortId}`,
        meetingTitle: meeting.title ?? "Meeting",
        organizerName: organizer.name,
      },
    };
  } else {
    return {
      composerContext: {
        intent: "confirm_time_no_match",
        pickerLink: `${env.APP_URL}/meeting/${meeting.shortId}`,
        meetingTitle: meeting.title ?? "Meeting",
        organizerName: organizer.name,
      },
    };
  }
}

export async function handleReschedule(ctx: IntentContext): Promise<IntentHandlerResult> {
  const { meeting, thread, organizer, tz, tokens, replyTo, extracted, calendarDescription, emailSubject } = ctx;
  if (!tokens) {
    return {
      composerContext: { intent: "reschedule" },
      skipPipeline: true,
      fixedMessage: "I can't reschedule without calendar access.\n\n- Luca",
      fixedTo: replyTo,
      fixedBcc: [organizer.email],
    };
  }

  await machine.startRescheduling(meeting.id, tokens);

  const newSlots = await findAvailableSlots(
    organizer.id,
    meeting.id,
    meeting.durationMin,
    extracted.time_preferences,
    10,
    meeting.meetingTypeId,
  );

  await notifyUser({
    type: "meeting_rescheduled",
    userId: organizer.id,
    meetingTitle: meeting.title ?? "Meeting",
    meetingShortId: meeting.shortId,
  });

  if (newSlots.length > 0) {
    const reschedIsVideoCall = await isVideoCallType(meeting.meetingTypeId);

    const reschedResult = await machine.proposeTimes(
      meeting.id,
      newSlots.map((s) => ({ start: s.start, end: s.end })),
      tokens,
      meeting.title ?? emailSubject,
      calendarDescription,
      { addGoogleMeet: reschedIsVideoCall, timeZone: tz },
    );

    const formattedSlots = reschedResult.slots
      .map((s, i) => `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`)
      .join("\n");

    return {
      composerContext: {
        intent: "reschedule",
        formattedSlots,
        pickerLink: `${env.APP_URL}/meeting/${meeting.shortId}`,
        meetingTitle: meeting.title ?? emailSubject,
        organizerName: organizer.name,
      },
    };
  }

  return {
    composerContext: {
      intent: "reschedule",
      noSlotsMessage: "I'm having trouble finding open times. Could you share some specific days or times that work?",
      meetingTitle: meeting.title ?? emailSubject,
      organizerName: organizer.name,
    },
  };
}

export async function handleDecline(ctx: IntentContext): Promise<IntentHandlerResult> {
  const { meeting, organizer, tokens } = ctx;

  if (tokens) {
    await machine.cancelMeeting(meeting.id, tokens);
  }

  await notifyUser({
    type: "meeting_cancelled",
    userId: organizer.id,
    meetingTitle: meeting.title ?? "Meeting",
    meetingShortId: meeting.shortId,
  });

  return {
    composerContext: {
      intent: "decline",
      meetingTitle: meeting.title ?? "Meeting",
      organizerName: organizer.name,
    },
  };
}

export async function handleAskForMoreTimes(ctx: IntentContext): Promise<IntentHandlerResult> {
  const { meeting, thread, organizer, tz, tokens, replyTo, extracted, calendarDescription, emailSubject } = ctx;
  if (!tokens) {
    return {
      composerContext: { intent: "ask_for_more_times" },
      skipPipeline: true,
      fixedMessage: "I can't find more times without calendar access.\n\n- Luca",
      fixedTo: replyTo,
      fixedBcc: [organizer.email],
    };
  }

  // If currently proposed, start rescheduling first
  if (meeting.status === "proposed") {
    await machine.startRescheduling(meeting.id, tokens);
  }

  const moreSlots = await findAvailableSlots(
    organizer.id,
    meeting.id,
    meeting.durationMin,
    extracted.time_preferences,
    14,
    meeting.meetingTypeId,
  );

  if (moreSlots.length > 0) {
    const altIsVideoCall = await isVideoCallType(meeting.meetingTypeId);

    const altResult = await machine.proposeTimes(
      meeting.id,
      moreSlots.map((s) => ({ start: s.start, end: s.end })),
      tokens,
      meeting.title ?? emailSubject,
      calendarDescription,
      { addGoogleMeet: altIsVideoCall, timeZone: tz },
    );

    const formattedSlots = altResult.slots
      .map((s, i) => `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`)
      .join("\n");

    return {
      composerContext: {
        intent: "ask_for_more_times",
        formattedSlots,
        pickerLink: `${env.APP_URL}/meeting/${meeting.shortId}`,
        meetingTitle: meeting.title ?? emailSubject,
        organizerName: organizer.name,
      },
    };
  }

  return {
    composerContext: {
      intent: "ask_for_more_times",
      noSlotsMessage: "I'm having trouble finding open times in the next two weeks. Could you share some specific days or times that work for you?",
      meetingTitle: meeting.title ?? emailSubject,
      organizerName: organizer.name,
    },
  };
}

export async function handleFreeformOrUnrelated(ctx: IntentContext, senderEmail: string): Promise<IntentHandlerResult> {
  return {
    composerContext: {
      intent: ctx.extracted.intent,
      meetingTitle: ctx.meeting.title ?? "Meeting",
      organizerName: ctx.organizer.name,
      senderName: senderEmail,
      originalEmailSummary: ctx.extracted.meeting_context_summary,
    },
  };
}
