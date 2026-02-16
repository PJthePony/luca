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
import { parseTaskEmail } from "../lib/claude.js";
import { createTessioTask } from "../lib/tessio.js";
import { EmailDirection } from "../types/index.js";
import type { GoogleTokens } from "../types/index.js";
import { env } from "../config.js";

export const webhookRoutes = new Hono();

/**
 * Mailgun inbound webhook endpoint.
 * Receives parsed email data when someone sends an email to luca@tanzillo.ai.
 */
webhookRoutes.post("/inbound", async (c) => {
  const body = await c.req.parseBody();

  try {
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

    // Check: is this a direct email to Luca (not a reply to an existing thread)?
    const lucaAddr = `luca@${env.MAILGUN_DOMAIN}`;
    const isLucaInTo = email.to.some((addr) => addr.toLowerCase().includes(lucaAddr));
    const isLucaInCc = email.cc.some((addr) => addr.toLowerCase().includes(lucaAddr));
    const hasReplyHeaders = !!(email.inReplyTo || email.references);

    if (isLucaInTo && !isLucaInCc && !hasReplyHeaders) {
      return await handleDirectTaskEmail(email, body as Record<string, unknown>, c);
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

/** Handle a direct email to Luca (task creation, not scheduling). */
async function handleDirectTaskEmail(
  email: ReturnType<typeof parseInboundWebhook>,
  body: Record<string, unknown>,
  c: any,
) {
  // Find the account owner — must be a registered user
  const taskOwner = await db.query.users.findFirst({
    where: eq(users.email, email.from),
  });

  if (!taskOwner) {
    console.warn(`Direct email from unregistered user: ${email.from}`);
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

  const task = await createTessioTask({
    title: parsed.task_title,
    notes: parsed.task_notes,
    location: parsed.task_location,
    tags: ["luca"],
    activate_at: parsed.task_activate_at,
  });

  // Reply to the sender with confirmation
  await sendEmail({
    to: [email.from],
    subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
    text: `${parsed.response_draft}\n\n- Luca`,
    headers: email.messageId ? { "In-Reply-To": email.messageId } : {},
  });

  return c.json({ status: "task_created", taskId: task.id });
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
