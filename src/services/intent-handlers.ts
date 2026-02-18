import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, meetingLocations, meetingTypes, participants, proposedSlots } from "../db/schema.js";
import { sendThreadedReply } from "./email.js";
import { findAvailableSlots } from "./slot-proposer.js";
import * as machine from "./meeting-machine.js";
import { notifyUser } from "./notification.js";
import { getAttendeeEmails, isVideoCallType } from "./queries.js";
import type { ParsedEmail } from "../types/index.js";
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
  parsed: ParsedEmail;
  calendarDescription: string | undefined;
  emailSubject: string;
}

// ── Intent Handlers ─────────────────────────────────────────────────────────

export async function handleScheduleNew(ctx: IntentContext): Promise<void> {
  const { meeting, thread, organizer, tz, tokens, replyTo, parsed, calendarDescription, emailSubject } = ctx;

  if (!tokens) {
    await sendThreadedReply({
      threadId: thread.id,
      to: [organizer.email],
      text: `Hi ${organizer.name}, I'd love to help schedule this meeting, but I don't have access to your Google Calendar yet. Please connect it at ${env.APP_URL}/auth/google?userId=${organizer.id}\n\n- Luca`,
    });
    return;
  }

  // Resolve meeting type from AI inference
  let effectiveDuration = parsed.meeting_details.duration_minutes ?? 30;
  const aiMeetingTypeId = parsed.meeting_details.meeting_type_id;
  let matchedTypeId: string | undefined;

  // Get participant names for title building
  const allParticipants = await db.query.participants.findMany({
    where: eq(participants.meetingId, meeting.id),
  });

  if (aiMeetingTypeId) {
    // Look up by ID, verify ownership
    let matchedType = await db.query.meetingTypes.findFirst({
      where: and(
        eq(meetingTypes.id, aiMeetingTypeId),
        eq(meetingTypes.userId, organizer.id),
      ),
    });

    // Fallback: if AI returned a bad ID, use the user's default meeting type
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
      if (!parsed.meeting_details.duration_minutes) {
        effectiveDuration = matchedType.defaultDuration;
      }

      // Build meeting title: "Coffee for P.J. and Christina"
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
    parsed.time_preferences,
    10,
    matchedTypeId,
  );

  if (slots.length === 0) {
    await sendThreadedReply({
      threadId: thread.id,
      to: replyTo,
      bcc: [organizer.email],
      text: `${parsed.response_draft}\n\nI wasn't able to find any available times in the next 10 days. Could you share some times that work for you?\n\nYou can also use this link to see options: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
    });
    return;
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

  // Format reply email
  const timeList = proposeResult.slots
    .map((s, i) => `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`)
    .join("\n");

  const agendaAck = parsed.agenda_items && parsed.agenda_items.length > 0
    ? `\n\nI've noted the discussion topics for the agenda.`
    : "";

  // Check for in-person location options
  let locationNote = "";
  if (resolvedType && !resolvedType.isOnline) {
    const locations = await db.query.meetingLocations.findMany({
      where: eq(meetingLocations.meetingTypeId, resolvedType.id),
      orderBy: (loc, { asc }) => [asc(loc.sortOrder)],
    });
    if (locations.length > 0) {
      const locList = locations.map((l) => `• ${l.name}${l.address ? ` (${l.address})` : ""}`).join("\n");
      locationNote = `\n\nHere are some location options:\n${locList}\n\nYou can pick a time and location here: ${env.APP_URL}/meeting/${meeting.shortId}`;
    } else if (resolvedType.defaultLocation) {
      locationNote = `\n\nSuggested location: ${resolvedType.defaultLocation}`;
    }
  }

  let meetNote = "";
  if (isVideoCall && proposeResult.meetLink) {
    meetNote = `\n\nA Google Meet link will be included in the calendar invite.`;
  }

  let phoneNote = "";
  if (isPhoneCall) {
    phoneNote = `\n\nSince this is a phone call, could you share your phone number? ${organizer.name} will call you at the selected time.`;
  }

  const pickerLink = locationNote
    ? ""
    : `\n\nYou can also pick a time here: ${env.APP_URL}/meeting/${meeting.shortId}`;

  await sendThreadedReply({
    threadId: thread.id,
    to: replyTo,
    bcc: [organizer.email],
    text: `${parsed.response_draft}\n\nHere are some times that work:\n\n${timeList}\n\nJust reply with your preferred option, or let me know if none of these work and I'll find more times.${agendaAck}${meetNote}${phoneNote}${locationNote}${pickerLink}\n\n- Luca`,
  });
}

export async function handleConfirmTime(ctx: IntentContext): Promise<void> {
  const { meeting, thread, organizer, tz, tokens, replyTo, parsed } = ctx;
  if (!tokens || !parsed.selected_time) return;

  const meetingSlots = await db.query.proposedSlots.findMany({
    where: eq(proposedSlots.meetingId, meeting.id),
  });

  const selectedStart = new Date(parsed.selected_time.start);
  const matchedSlot = meetingSlots.find(
    (s) => Math.abs(s.startTime.getTime() - selectedStart.getTime()) < 30 * 60 * 1000,
  );

  if (matchedSlot) {
    await machine.confirmSlot(meeting.id, matchedSlot.id, tokens);
    const confirmedTime = formatTime(matchedSlot.startTime, tz);

    await sendThreadedReply({
      threadId: thread.id,
      to: replyTo,
      bcc: [organizer.email],
      text: `${parsed.response_draft}\n\nGreat, the meeting is confirmed for ${confirmedTime}. A calendar invite has been sent.\n\nIf you need to reschedule, just reply to this email or visit: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
    });

    await notifyUser({
      type: "meeting_confirmed",
      userId: organizer.id,
      meetingTitle: meeting.title ?? "Meeting",
      meetingShortId: meeting.shortId,
      confirmedTime,
    });
  } else {
    await sendThreadedReply({
      threadId: thread.id,
      to: replyTo,
      bcc: [organizer.email],
      text: `${parsed.response_draft}\n\nI couldn't match that to one of the proposed times. Could you reply with the number (1, 2, or 3) or pick a time here: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
    });
  }
}

export async function handleReschedule(ctx: IntentContext): Promise<void> {
  const { meeting, thread, organizer, tz, tokens, replyTo, parsed, calendarDescription, emailSubject } = ctx;
  if (!tokens) return;

  await machine.startRescheduling(meeting.id, tokens);

  const newSlots = await findAvailableSlots(
    organizer.id,
    meeting.id,
    meeting.durationMin,
    parsed.time_preferences,
    10,
    meeting.meetingTypeId,
  );

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

    const timeList = reschedResult.slots
      .map((s, i) => `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`)
      .join("\n");

    await sendThreadedReply({
      threadId: thread.id,
      to: replyTo,
      bcc: [organizer.email],
      text: `${parsed.response_draft}\n\nNo problem! Here are some new times:\n\n${timeList}\n\nOr pick a time here: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
    });
  }

  await notifyUser({
    type: "meeting_rescheduled",
    userId: organizer.id,
    meetingTitle: meeting.title ?? "Meeting",
    meetingShortId: meeting.shortId,
  });
}

export async function handleDecline(ctx: IntentContext): Promise<void> {
  const { meeting, thread, organizer, tokens, replyTo, parsed } = ctx;

  if (tokens) {
    await machine.cancelMeeting(meeting.id, tokens);
  }

  await sendThreadedReply({
    threadId: thread.id,
    to: replyTo,
    bcc: [organizer.email],
    text: `${parsed.response_draft}\n\n- Luca`,
  });

  await notifyUser({
    type: "meeting_cancelled",
    userId: organizer.id,
    meetingTitle: meeting.title ?? "Meeting",
    meetingShortId: meeting.shortId,
  });
}

export async function handleAskForMoreTimes(ctx: IntentContext): Promise<void> {
  const { meeting, thread, organizer, tz, tokens, replyTo, parsed, calendarDescription, emailSubject } = ctx;
  if (!tokens) return;

  // If currently proposed, start rescheduling first
  if (meeting.status === "proposed") {
    await machine.startRescheduling(meeting.id, tokens);
  }

  const moreSlots = await findAvailableSlots(
    organizer.id,
    meeting.id,
    meeting.durationMin,
    parsed.time_preferences,
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

    const timeList = altResult.slots
      .map((s, i) => `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`)
      .join("\n");

    await sendThreadedReply({
      threadId: thread.id,
      to: replyTo,
      bcc: [organizer.email],
      text: `${parsed.response_draft}\n\nHere are some more options:\n\n${timeList}\n\nOr pick a time here: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
    });
  } else {
    await sendThreadedReply({
      threadId: thread.id,
      to: replyTo,
      bcc: [organizer.email],
      text: `${parsed.response_draft}\n\nI'm having trouble finding open times in the next two weeks. Could you share some specific days or times that work for you?\n\n- Luca`,
    });
  }
}

export async function handleFreeformOrUnrelated(ctx: IntentContext, senderEmail: string): Promise<void> {
  const { thread, organizer, parsed } = ctx;

  await sendThreadedReply({
    threadId: thread.id,
    to: [senderEmail],
    bcc: [organizer.email],
    text: `${parsed.response_draft}\n\n- Luca`,
  });
}
