import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailMessages, emailThreads, meetings, participants, users } from "../db/schema.js";
import {
  parseInboundWebhook,
  verifyWebhookSignature,
} from "../lib/mailgun.js";
import { resolveThread } from "../services/thread-resolver.js";
import { parseInboundEmail } from "../services/ai-parser.js";
import { sendThreadedReply } from "../services/email.js";
import { findAvailableSlots } from "../services/slot-proposer.js";
import * as machine from "../services/meeting-machine.js";
import { notifyUser } from "../services/notification.js";
import { EmailDirection } from "../types/index.js";
import { env } from "../config.js";

export const webhookRoutes = new Hono();

/**
 * Mailgun inbound webhook endpoint.
 * Receives parsed email data when someone sends an email to luca@tanzillo.ai.
 */
webhookRoutes.post("/inbound", async (c) => {
  const body = await c.req.parseBody();

  // Verify webhook signature in production
  if (env.NODE_ENV === "production") {
    const timestamp = body.timestamp as string;
    const token = body.token as string;
    const signature = body.signature as string;

    if (!verifyWebhookSignature(timestamp, token, signature)) {
      return c.json({ error: "Invalid signature" }, 403);
    }
  }

  const email = parseInboundWebhook(body as Record<string, unknown>);

  // Idempotency: skip if we've already processed this message
  if (email.messageId) {
    const existing = await db.query.emailMessages.findFirst({
      where: eq(emailMessages.messageIdHeader, email.messageId),
    });
    if (existing) {
      return c.json({ status: "already_processed" });
    }
  }

  // Resolve the thread / meeting
  const resolved = await resolveThread(email);
  if (!resolved) {
    console.warn(`Could not resolve thread for email from ${email.from}`);
    return c.json({ status: "unresolved" });
  }

  const { meeting, thread, organizer, isNewMeeting } = resolved;

  // Store the inbound message
  await db.insert(emailMessages).values({
    threadId: thread.id,
    messageIdHeader: email.messageId || `<unknown-${Date.now()}>`,
    fromEmail: email.from,
    fromName: email.fromName,
    toEmails: email.to,
    ccEmails: email.cc,
    subject: email.subject,
    bodyText: email.strippedText || email.bodyPlain,
    bodyHtml: email.bodyHtml,
    direction: EmailDirection.INBOUND,
    rawPayload: body as Record<string, unknown>,
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

  // Get organizer's Google tokens
  const tokens = organizer.googleTokens as {
    access_token?: string | null;
    refresh_token?: string | null;
  } | null;

  // Determine recipients for the reply (everyone except Luca and organizer)
  const allParticipants = await db.query.participants.findMany({
    where: eq(participants.meetingId, meeting.id),
  });
  const replyTo = allParticipants
    .filter((p) => p.role !== "organizer")
    .map((p) => p.email);

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

      // Find available slots
      const slots = await findAvailableSlots(
        organizer.id,
        meeting.id,
        parsed.meeting_details.duration_minutes ?? 30,
        parsed.time_preferences,
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

      // Create tentative holds and transition to PROPOSED
      const proposedSlotRecords = await machine.proposeTimes(
        meeting.id,
        slots.map((s) => ({ start: s.start, end: s.end })),
        tokens,
        meeting.title ?? email.subject,
      );

      // Format times for the email
      const timeList = proposedSlotRecords
        .map(
          (s, i) =>
            `${i + 1}. ${s.startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${s.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - ${s.endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
        )
        .join("\n");

      await sendThreadedReply({
        threadId: thread.id,
        to: replyTo,
        bcc: [organizer.email],
        text: `${parsed.response_draft}\n\nHere are some times that work:\n\n${timeList}\n\nJust reply with your preferred option, or let me know if none of these work and I'll find more times.\n\nYou can also pick a time here: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
      });
      break;
    }

    case "confirm_time": {
      if (!tokens || !parsed.selected_time) break;

      // Find the matching proposed slot
      const meetingSlots = await db.query.proposedSlots.findMany({
        where: eq(
          (await import("../db/schema.js")).proposedSlots.meetingId,
          meeting.id,
        ),
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

        const confirmedTime = `${matchedSlot.startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${matchedSlot.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

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
      );

      if (newSlots.length > 0) {
        const proposedSlotRecords = await machine.proposeTimes(
          meeting.id,
          newSlots.map((s) => ({ start: s.start, end: s.end })),
          tokens,
          meeting.title ?? email.subject,
        );

        const timeList = proposedSlotRecords
          .map(
            (s, i) =>
              `${i + 1}. ${s.startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${s.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - ${s.endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
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
      );

      if (moreSlots.length > 0) {
        const proposedSlotRecords = await machine.proposeTimes(
          meeting.id,
          moreSlots.map((s) => ({ start: s.start, end: s.end })),
          tokens,
          meeting.title ?? email.subject,
        );

        const timeList = proposedSlotRecords
          .map(
            (s, i) =>
              `${i + 1}. ${s.startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${s.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - ${s.endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
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
});
