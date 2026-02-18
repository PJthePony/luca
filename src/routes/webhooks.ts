import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailMessages, meetings, users } from "../db/schema.js";
import { parseInboundWebhook, sendEmail } from "../lib/mailgun.js";
import { resolveThread } from "../services/thread-resolver.js";
import { parseInboundEmail } from "../services/ai-parser.js";
import { getAttendeeEmails } from "../services/queries.js";
import {
  handleScheduleNew,
  handleConfirmTime,
  handleReschedule,
  handleDecline,
  handleAskForMoreTimes,
  handleFreeformOrUnrelated,
  buildCalendarDescription,
} from "../services/intent-handlers.js";
import type { IntentContext } from "../services/intent-handlers.js";
import { EmailDirection } from "../types/index.js";
import type { GoogleTokens } from "../types/index.js";
import { env } from "../config.js";

export const webhookRoutes = new Hono();

/**
 * Mailgun inbound webhook endpoint — catch-all for *@tanzillo.ai.
 * Routes emails to the appropriate handler based on the recipient address.
 */
webhookRoutes.post("/inbound", async (c) => {
  const body = await c.req.parseBody();

  try {
    const email = parseInboundWebhook(body as Record<string, unknown>);

    // ── Route by recipient address ───────────────────────────────────────
    const allRecipients = [...email.to, ...email.cc].map((a) => a.toLowerCase());
    const tessioAddr = `tessio@${env.MAILGUN_DOMAIN}`;
    const lucaAddr = `luca@${env.MAILGUN_DOMAIN}`;

    const isForTessio = allRecipients.some((addr) => addr.includes(tessioAddr));
    const isForLuca = allRecipients.some((addr) => addr.includes(lucaAddr));

    // Tessio: forward to the email-to-task Edge Function
    if (isForTessio) {
      return await forwardToTessio(body as Record<string, unknown>, c);
    }

    // Not addressed to any known app — reply with guidance
    if (!isForLuca) {
      await sendEmail({
        to: [email.from],
        subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
        text: `Hey! I got your email, but I'm not sure what to do with it.\n\nHere's who can help:\n• tessio@${env.MAILGUN_DOMAIN} — for creating tasks\n• luca@${env.MAILGUN_DOMAIN} — CC me on an email thread to schedule a meeting\n\n- The Family`,
        headers: email.messageId ? { "In-Reply-To": email.messageId } : {},
      });
      return c.json({ status: "unknown_recipient" });
    }

    // ── Luca: scheduling flow ────────────────────────────────────────────

    // Idempotency: skip if we've already processed this message
    if (email.messageId) {
      const existing = await db.query.emailMessages.findFirst({
        where: eq(emailMessages.messageIdHeader, email.messageId),
      });
      if (existing) {
        return c.json({ status: "already_processed" });
      }
    }

    const isLucaInTo = email.to.some((addr) => addr.toLowerCase().includes(lucaAddr));
    const isLucaInCc = email.cc.some((addr) => addr.toLowerCase().includes(lucaAddr));
    const hasReplyHeaders = !!(email.inReplyTo || email.references);

    if (isLucaInTo && !isLucaInCc && !hasReplyHeaders) {
      // Direct email to Luca that isn't part of a scheduling thread
      await sendEmail({
        to: [email.from],
        subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
        text: `Hey! I'm Luca, and I handle calendar scheduling. To create a task, email tessio@${env.MAILGUN_DOMAIN} instead — Tessio's got you covered.\n\nTo schedule a meeting, just CC me (luca@${env.MAILGUN_DOMAIN}) on an email thread with the people you want to meet.\n\n- Luca`,
        headers: email.messageId ? { "In-Reply-To": email.messageId } : {},
      });
      return c.json({ status: "redirected_to_tessio" });
    }

    // Resolve the thread / meeting (existing scheduling flow)
    const resolved = await resolveThread(email);
    if (!resolved) {
      console.warn(`Could not resolve thread for email from ${email.from}`);
      return c.json({ status: "unresolved" });
    }

    const { meeting, thread, organizer } = resolved;
    const tz = organizer.timezone || "America/New_York";

    // Store the inbound message
    await storeInboundMessage(email, thread.id, body as Record<string, unknown>);

    // Parse the email with Claude
    const parsed = await parseInboundEmail(
      email.strippedText || email.bodyPlain,
      email.from,
      email.fromName,
      email.subject,
      meeting.id,
      organizer.id,
    );

    // Update meeting with context summary and agenda items
    await updateMeetingContext(meeting, parsed);

    // Build calendar event description from context + agenda
    const updatedAgenda = [
      ...((meeting.agenda as string[]) ?? []),
      ...(parsed.agenda_items ?? []),
    ];
    const calendarDescription = buildCalendarDescription(
      meeting.notes ?? parsed.meeting_context_summary,
      updatedAgenda,
    );

    // Get organizer's Google tokens and attendee emails
    const tokens = organizer.googleTokens as GoogleTokens | null;
    const replyTo = await getAttendeeEmails(meeting.id);

    // Build shared context for intent handlers
    const ctx: IntentContext = {
      meeting,
      thread: { id: thread.id, subject: thread.subject },
      organizer: {
        id: organizer.id,
        name: organizer.name,
        email: organizer.email,
        timezone: tz,
        googleTokens: organizer.googleTokens,
      },
      tz,
      tokens,
      replyTo,
      parsed,
      calendarDescription,
      emailSubject: email.subject,
    };

    // Dispatch to intent handler
    switch (parsed.intent) {
      case "schedule_new":
        await handleScheduleNew(ctx);
        break;
      case "confirm_time":
        await handleConfirmTime(ctx);
        break;
      case "reschedule":
        await handleReschedule(ctx);
        break;
      case "decline":
        await handleDecline(ctx);
        break;
      case "ask_for_more_times":
      case "propose_alternatives":
        await handleAskForMoreTimes(ctx);
        break;
      case "freeform_question":
      case "unrelated":
        await handleFreeformOrUnrelated(ctx, email.from);
        break;
    }

    return c.json({ status: "processed", intent: parsed.intent });
  } catch (err) {
    console.error("=== WEBHOOK ERROR ===");
    console.error("Error:", err);
    console.error("Stack:", err instanceof Error ? err.stack : "no stack");
    return c.json({ status: "error", message: "Internal server error" }, 500);
  }
});

// ── Internal Helpers ────────────────────────────────────────────────────────

/** Forward the raw Mailgun payload to Tessio's email-to-task Edge Function. */
async function forwardToTessio(
  body: Record<string, unknown>,
  c: any,
) {
  const tessioUrl = `${env.SUPABASE_URL}/functions/v1/email-to-task`;

  // Rebuild the form data to forward to the Edge Function
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      formData.append(key, String(value));
    }
  }

  try {
    const response = await fetch(tessioUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: formData,
    });

    const result = await response.json();
    return c.json({ status: "forwarded_to_tessio", tessio: result });
  } catch (err) {
    console.error("Failed to forward to Tessio:", err);

    // Parse sender from body so we can reply with an error
    const email = parseInboundWebhook(body);
    await sendEmail({
      to: [email.from],
      subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
      text: `Hey! I tried to forward your email to Tessio for task creation, but something went wrong. Please try again later or add the task directly at tessio.tanzillo.ai.\n\n- Luca`,
      headers: email.messageId ? { "In-Reply-To": email.messageId } : {},
    });

    return c.json({ status: "tessio_forward_error" }, 500);
  }
}

/** Store an inbound email message in the database. */
async function storeInboundMessage(
  email: ReturnType<typeof parseInboundWebhook>,
  threadId: string,
  body: Record<string, unknown>,
) {
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
    threadId,
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
}

/** Update meeting with context summary and agenda items from AI parsing. */
async function updateMeetingContext(
  meeting: typeof meetings.$inferSelect,
  parsed: { meeting_context_summary?: string; agenda_items?: string[] },
) {
  const meetingUpdates: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.meeting_context_summary && !meeting.notes) {
    meetingUpdates.notes = parsed.meeting_context_summary;
  }

  if (parsed.agenda_items && parsed.agenda_items.length > 0) {
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
}
