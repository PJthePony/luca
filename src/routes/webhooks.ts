import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailMessages, emailThreads, meetings, meetingLocations, meetingTypes, participants, proposedSlots, users } from "../db/schema.js";
import {
  parseInboundWebhook,
  verifyWebhookSignature,
  sendEmail,
} from "../lib/mailgun.js";
import { resolveThread } from "../services/thread-resolver.js";
import { parseInboundEmail } from "../services/ai-parser.js";
import { sendThreadedReply } from "../services/email.js";
import { findAvailableSlots } from "../services/slot-proposer.js";
import * as machine from "../services/meeting-machine.js";
import { notifyUser } from "../services/notification.js";
import { parseTaskEmail } from "../lib/claude.js";
import { createNexbiteTask } from "../lib/nexbite.js";
import { EmailDirection } from "../types/index.js";
import { env } from "../config.js";

export const webhookRoutes = new Hono();

/** Format a date/time range in a given timezone for display in emails. */
function formatSlot(start: Date, end: Date, tz: string): string {
  const date = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${date} at ${startTime} - ${endTime}`;
}

/** Build a calendar event description from context summary + agenda. */
function buildCalendarDescription(
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

function formatTime(date: Date, tz: string): string {
  const d = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const t = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${d} at ${t}`;
}

/**
 * Mailgun inbound webhook endpoint.
 * Receives parsed email data when someone sends an email to luca@tanzillo.ai.
 */
webhookRoutes.post("/inbound", async (c) => {
  const body = await c.req.parseBody();

  try {

  // Debug: log the raw webhook payload keys
  console.log("=== INBOUND WEBHOOK ===");
  console.log("Body keys:", Object.keys(body));
  console.log("from:", body.from);
  console.log("sender:", body.sender);
  console.log("recipient:", body.recipient);
  console.log("To:", body.To);
  console.log("Cc:", body.Cc);
  console.log("subject:", body.subject);

  // Note: Mailgun inbound routing does NOT sign the payload.
  // Signature verification only applies to Mailgun event webhooks.

  const email = parseInboundWebhook(body as Record<string, unknown>);

  console.log("Parsed email:", JSON.stringify({
    from: email.from,
    to: email.to,
    cc: email.cc,
    subject: email.subject,
    messageId: email.messageId,
    strippedText: email.strippedText?.slice(0, 100),
  }));

  // Idempotency: skip if we've already processed this message
  if (email.messageId) {
    const existing = await db.query.emailMessages.findFirst({
      where: eq(emailMessages.messageIdHeader, email.messageId),
    });
    if (existing) {
      return c.json({ status: "already_processed" });
    }
  }

  // Check: is this a direct email to Luca (not a reply to an existing thread)?
  const lucaAddr = `luca@${env.MAILGUN_DOMAIN}`;
  const isLucaInTo = email.to.some(
    (addr) => addr.toLowerCase().includes(lucaAddr),
  );
  const isLucaInCc = email.cc.some(
    (addr) => addr.toLowerCase().includes(lucaAddr),
  );
  const hasReplyHeaders = !!(email.inReplyTo || email.references);

  if (isLucaInTo && !isLucaInCc && !hasReplyHeaders) {
    // Direct email to Luca — use Claude to decide: task or scheduling
    console.log("=== DIRECT EMAIL TO LUCA — parsing as potential task ===");

    // Find the account owner (task owner)
    const taskOwner = await db.query.users.findFirst({
      where: eq(users.email, email.from),
    }) ?? await db.query.users.findFirst();

    if (!taskOwner) {
      console.warn("No registered users found to own this task");
      return c.json({ status: "no_user" });
    }

    const tz = taskOwner.timezone || "America/New_York";

    const parsed = await parseTaskEmail(
      email.strippedText || email.bodyPlain,
      email.from,
      email.fromName,
      email.subject,
      tz,
    );

    console.log("Task parsed:", JSON.stringify(parsed));

    // Create the task in Nexbite
    const task = await createNexbiteTask({
      title: parsed.task_title,
      notes: parsed.task_notes,
      location: parsed.task_location,
      tags: ["luca"],
      activate_at: parsed.task_activate_at,
    });

    console.log("Created Nexbite task:", JSON.stringify(task));

    // Reply to the sender with confirmation
    await sendEmail({
      to: [email.from],
      subject: email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`,
      text: `${parsed.response_draft}\n\n- Luca`,
      headers: email.messageId ? { "In-Reply-To": email.messageId } : {},
    });

    return c.json({ status: "task_created", taskId: task.id });
  }

  // Resolve the thread / meeting (existing scheduling flow)
  const resolved = await resolveThread(email);
  if (!resolved) {
    console.warn(`Could not resolve thread for email from ${email.from}`);
    return c.json({ status: "unresolved" });
  }

  const { meeting, thread, organizer, isNewMeeting } = resolved;
  const tz = organizer.timezone || "America/New_York";

  // Store the inbound message
  // Sanitize body for jsonb: Hono's parseBody() can return File objects
  // which aren't JSON-serializable and crash Drizzle's value mapper.
  const sanitizedPayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      sanitizedPayload[key] = value;
    } else if (value === null || value === undefined) {
      sanitizedPayload[key] = null;
    } else {
      sanitizedPayload[key] = String(value);
    }
  }

  await db.insert(emailMessages).values({
    threadId: thread.id,
    messageIdHeader: email.messageId || `<unknown-${Date.now()}>`,
    fromEmail: email.from,
    fromName: email.fromName || null,
    toEmails: email.to,
    ccEmails: email.cc.length > 0 ? email.cc : null,
    subject: email.subject,
    bodyText: email.strippedText || email.bodyPlain || null,
    bodyHtml: email.bodyHtml || null,
    direction: EmailDirection.INBOUND,
    rawPayload: sanitizedPayload,
  });

  // Parse the email with Claude
  const parsed = await parseInboundEmail(
    email.strippedText || email.bodyPlain,
    email.from,
    email.fromName,
    email.subject,
    meeting.id,
    organizer.id,
  );

  console.log("AI parsed intent:", parsed.intent);
  console.log("AI response_draft:", parsed.response_draft?.slice(0, 100));
  console.log("AI meeting_context_summary:", parsed.meeting_context_summary?.slice(0, 100));
  console.log("AI agenda_items:", parsed.agenda_items);

  // Store context summary and agenda items on the meeting
  const meetingUpdates: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.meeting_context_summary && !meeting.notes) {
    meetingUpdates.notes = parsed.meeting_context_summary;
  }

  if (parsed.agenda_items && parsed.agenda_items.length > 0) {
    // Append new agenda items to existing ones (deduped)
    const existingAgenda = (meeting.agenda as string[]) ?? [];
    const newItems = parsed.agenda_items.filter(
      (item) => !existingAgenda.some((existing) => existing.toLowerCase() === item.toLowerCase()),
    );
    if (newItems.length > 0) {
      meetingUpdates.agenda = [...existingAgenda, ...newItems];
    }
  }

  if (Object.keys(meetingUpdates).length > 1) {
    await db
      .update(meetings)
      .set(meetingUpdates)
      .where(eq(meetings.id, meeting.id));
  }

  // Build calendar event description from context + agenda
  const calendarDescription = buildCalendarDescription(
    (meetingUpdates.notes as string) ?? meeting.notes ?? parsed.meeting_context_summary,
    ((meetingUpdates.agenda as string[]) ?? (meeting.agenda as string[]) ?? []),
  );

  // Get organizer's Google tokens
  const tokens = organizer.googleTokens as {
    access_token?: string | null;
    refresh_token?: string | null;
  } | null;

  console.log("Has tokens:", !!tokens, "Has access_token:", !!tokens?.access_token);

  // Determine recipients for the reply (everyone except Luca and organizer)
  const allParticipants = await db.query.participants.findMany({
    where: eq(participants.meetingId, meeting.id),
  });
  const replyTo = allParticipants
    .filter((p) => p.role !== "organizer")
    .map((p) => p.email);

  console.log("All participants:", allParticipants.map(p => `${p.email} (${p.role})`));
  console.log("Reply to:", replyTo);

  // Process based on intent
  switch (parsed.intent) {
    case "schedule_new": {
      if (!tokens) {
        await sendThreadedReply({
          threadId: thread.id,
          to: [organizer.email],
          text: `Hi ${organizer.name}, I'd love to help schedule this meeting, but I don't have access to your Google Calendar yet. Please connect it at ${env.APP_URL}/auth/google?userId=${organizer.id}\n\n- Luca`,
        });
        break;
      }

      // Resolve meeting type from AI inference
      let effectiveDuration = parsed.meeting_details.duration_minutes ?? 30;
      const aiMeetingType = parsed.meeting_details.meeting_type;
      let matchedTypeId: string | undefined;

      if (aiMeetingType) {
        const matchedType = await db.query.meetingTypes.findFirst({
          where: and(
            eq(meetingTypes.userId, organizer.id),
            eq(meetingTypes.slug, aiMeetingType),
          ),
        });

        if (matchedType) {
          matchedTypeId = matchedType.id;
          // Use the meeting type's default duration if AI didn't extract an explicit duration
          if (!parsed.meeting_details.duration_minutes) {
            effectiveDuration = matchedType.defaultDuration;
          }

          // Build meeting title: "Lunch: P.J./Nicole"
          const participantNames = allParticipants
            .filter((p) => p.role !== "organizer")
            .map((p) => {
              if (p.name) return p.name.split(/\s+/)[0]; // first name
              return p.email.split("@")[0]; // fallback to email prefix
            });
          const meetingTitle = `${matchedType.name}: ${organizer.name.split(/\s+/)[0]}/${participantNames.join("/")}`;

          // Store the meeting type, title, and location on the meeting
          const meetingUpdate: Record<string, unknown> = {
            meetingTypeId: matchedType.id,
            durationMin: effectiveDuration,
            title: meetingTitle,
            updatedAt: new Date(),
          };
          // Save the default location onto the meeting so it's available at confirmation
          if (matchedType.defaultLocation) {
            meetingUpdate.location = matchedType.defaultLocation;
          }
          await db
            .update(meetings)
            .set(meetingUpdate)
            .where(eq(meetings.id, meeting.id));

          // Re-read the meeting to get the updated title
          meeting.title = meetingTitle;

          console.log(`Resolved meeting type: ${matchedType.name} (${matchedType.slug}), duration: ${effectiveDuration}min, title: ${meetingTitle}`);
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
        const fallbackTitle = `Meeting: ${organizer.name.split(/\s+/)[0]}/${participantNames.join("/")}`;
        meeting.title = fallbackTitle;
        await db
          .update(meetings)
          .set({ title: fallbackTitle, updatedAt: new Date() })
          .where(eq(meetings.id, meeting.id));
      }

      // Find available slots (pass meetingTypeId for time window filtering)
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
        break;
      }

      // Determine if we need Google Meet or have special meeting type handling
      let resolvedType: typeof meetingTypes.$inferSelect | undefined;
      if (aiMeetingType) {
        resolvedType = (await db.query.meetingTypes.findFirst({
          where: and(
            eq(meetingTypes.userId, organizer.id),
            eq(meetingTypes.slug, aiMeetingType),
          ),
        })) ?? undefined;
      }

      const isVideoCall = resolvedType?.slug === "video_call" && resolvedType?.isOnline;
      const isPhoneCall = resolvedType?.slug === "phone_call";

      // Create tentative holds and transition to PROPOSED
      const proposeResult = await machine.proposeTimes(
        meeting.id,
        slots.map((s) => ({ start: s.start, end: s.end })),
        tokens,
        meeting.title ?? email.subject,
        calendarDescription,
        {
          addGoogleMeet: isVideoCall,
          location: resolvedType?.defaultLocation ?? undefined,
          timeZone: tz,
        },
      );
      const proposedSlotRecords = proposeResult.slots;

      // Format times for the email
      const timeList = proposedSlotRecords
        .map(
          (s, i) =>
            `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`,
        )
        .join("\n");

      // Acknowledge agenda items if extracted
      const agendaAck = parsed.agenda_items && parsed.agenda_items.length > 0
        ? `\n\nI've noted the discussion topics for the agenda.`
        : "";

      // Check if this is an in-person meeting with location options
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

      // Add Google Meet note for video calls
      let meetNote = "";
      if (isVideoCall && proposeResult.meetLink) {
        meetNote = `\n\nA Google Meet link will be included in the calendar invite.`;
      }

      // For phone calls, ask the other person for their number
      let phoneNote = "";
      if (isPhoneCall) {
        phoneNote = `\n\nSince this is a phone call, could you share your phone number? ${organizer.name} will call you at the selected time.`;
      }

      const pickerLink = locationNote
        ? "" // Already included the picker link in locationNote
        : `\n\nYou can also pick a time here: ${env.APP_URL}/meeting/${meeting.shortId}`;

      await sendThreadedReply({
        threadId: thread.id,
        to: replyTo,
        bcc: [organizer.email],
        text: `${parsed.response_draft}\n\nHere are some times that work:\n\n${timeList}\n\nJust reply with your preferred option, or let me know if none of these work and I'll find more times.${agendaAck}${meetNote}${phoneNote}${locationNote}${pickerLink}\n\n- Luca`,
      });
      break;
    }

    case "confirm_time": {
      if (!tokens || !parsed.selected_time) break;

      // Find the matching proposed slot
      const meetingSlots = await db.query.proposedSlots.findMany({
        where: eq(proposedSlots.meetingId, meeting.id),
      });

      // Try to match the selected time to a proposed slot
      const selectedStart = new Date(parsed.selected_time.start);
      const matchedSlot = meetingSlots.find(
        (s) =>
          Math.abs(s.startTime.getTime() - selectedStart.getTime()) <
          30 * 60 * 1000,
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
      break;
    }

    case "reschedule": {
      if (!tokens) break;

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
        // Check meeting type for Google Meet
        let reschedIsVideoCall = false;
        if (meeting.meetingTypeId) {
          const mType = await db.query.meetingTypes.findFirst({ where: eq(meetingTypes.id, meeting.meetingTypeId) });
          if (mType?.slug === "video_call" && mType?.isOnline) reschedIsVideoCall = true;
        }

        const reschedResult = await machine.proposeTimes(
          meeting.id,
          newSlots.map((s) => ({ start: s.start, end: s.end })),
          tokens,
          meeting.title ?? email.subject,
          calendarDescription,
          { addGoogleMeet: reschedIsVideoCall, timeZone: tz },
        );

        const timeList = reschedResult.slots
          .map(
            (s, i) =>
              `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`,
          )
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
      break;
    }

    case "decline": {
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
      break;
    }

    case "ask_for_more_times":
    case "propose_alternatives": {
      if (!tokens) break;

      // If currently proposed, start rescheduling first
      if (meeting.status === "proposed") {
        await machine.startRescheduling(meeting.id, tokens);
      }

      const moreSlots = await findAvailableSlots(
        organizer.id,
        meeting.id,
        meeting.durationMin,
        parsed.time_preferences,
        14, // Search further out
        meeting.meetingTypeId,
      );

      if (moreSlots.length > 0) {
        // Check meeting type for Google Meet
        let altIsVideoCall = false;
        if (meeting.meetingTypeId) {
          const mType = await db.query.meetingTypes.findFirst({ where: eq(meetingTypes.id, meeting.meetingTypeId) });
          if (mType?.slug === "video_call" && mType?.isOnline) altIsVideoCall = true;
        }

        const altResult = await machine.proposeTimes(
          meeting.id,
          moreSlots.map((s) => ({ start: s.start, end: s.end })),
          tokens,
          meeting.title ?? email.subject,
          calendarDescription,
          { addGoogleMeet: altIsVideoCall, timeZone: tz },
        );

        const timeList = altResult.slots
          .map(
            (s, i) =>
              `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`,
          )
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
      break;
    }

    case "freeform_question":
    case "unrelated": {
      await sendThreadedReply({
        threadId: thread.id,
        to: [email.from],
        bcc: [organizer.email],
        text: `${parsed.response_draft}\n\n- Luca`,
      });
      break;
    }
  }

  return c.json({ status: "processed", intent: parsed.intent });

  } catch (err) {
    console.error("=== WEBHOOK ERROR ===");
    console.error("Error:", err);
    console.error("Stack:", err instanceof Error ? err.stack : "no stack");
    return c.json({ status: "error", message: String(err) }, 500);
  }
});
