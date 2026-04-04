import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailMessages, emailThreads, meetings, users } from "../db/schema.js";
import { parseInboundWebhook, sendEmail } from "../lib/mailgun.js";
import { resolveThread, isResolveFailure } from "../services/thread-resolver.js";
import { extractInboundEmail, getThreadHistory } from "../services/ai-parser.js";
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
import { runComposeQCLoop } from "../services/ai-pipeline.js";
import { createDraft, updateDraftWithQC } from "../services/draft-manager.js";
import { sendThreadedReply } from "../services/email.js";
import { EmailDirection } from "../types/index.js";
import type { GoogleTokens, IntentHandlerResult } from "../types/index.js";
import { notifyUser, notifyDraftReady } from "../services/notification.js";
import { env } from "../config.js";

export const webhookRoutes = new Hono();

/**
 * Mailgun inbound webhook endpoint — catch-all for *@tanzillo.ai.
 * Routes emails to the appropriate handler based on the recipient address.
 */
webhookRoutes.post("/inbound", async (c) => {
  const body = await c.req.parseBody();
  let resolvedMeetingId: string | undefined;
  let resolvedOrganizerId: string | undefined;

  try {
    const email = parseInboundWebhook(body as Record<string, unknown>);

    // ── Route by recipient address ────��──────────────────────────────────
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

    // ── Luca: scheduling flow ────────────��───────────────────────────────

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
    if (isResolveFailure(resolved)) {
      console.warn(`Could not resolve thread for email from ${email.from}: ${resolved.reason}`);

      const replySubject = email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`;
      const replyHeaders: Record<string, string> = {};
      if (email.messageId) replyHeaders["In-Reply-To"] = email.messageId;

      if (resolved.reason === "unregistered_sender") {
        await sendEmail({
          to: [email.from],
          subject: replySubject,
          text: `Hey! I'm Luca, and I'd love to help schedule this meeting, but I don't have an account set up for your email address yet.\n\nAsk the person you're scheduling with to CC me (luca@${env.MAILGUN_DOMAIN}) from their account, and I'll take it from there.\n\n- Luca`,
          headers: replyHeaders,
        });
      } else if (resolved.reason === "no_thread_context") {
        await sendEmail({
          to: [email.from],
          subject: replySubject,
          text: `Hey! I got your email, but I can't find the scheduling thread it belongs to. This can happen if the original thread was lost or if the email headers changed.\n\nTo start fresh, send a new email to the person you want to meet and CC me (luca@${env.MAILGUN_DOMAIN}) — I'll find times that work for everyone.\n\n- Luca`,
          headers: replyHeaders,
        });
      } else {
        await sendEmail({
          to: [email.from],
          subject: replySubject,
          text: `Hey! I got your email, but I wasn't sure what to do with it. To schedule a meeting, CC me (luca@${env.MAILGUN_DOMAIN}) on an email thread with the people you want to meet.\n\n- Luca`,
          headers: replyHeaders,
        });
      }

      return c.json({ status: "unresolved", reason: resolved.reason });
    }

    const { meeting, thread, organizer } = resolved;
    resolvedMeetingId = meeting.id;
    resolvedOrganizerId = organizer.id;
    const tz = organizer.timezone || "America/New_York";

    // Store the inbound message
    await storeInboundMessage(email, thread.id, body as Record<string, unknown>);

    // ── NEW 3-AGENT PIPELINE ────────────────────────────────────────────

    // Agent 1: Extract structured data (no email prose)
    const { extracted, threadHistory } = await extractInboundEmail(
      email.strippedText || email.bodyPlain,
      email.from,
      email.fromName,
      email.subject,
      meeting.id,
      organizer.id,
    );

    // Update meeting with context summary and agenda items
    await updateMeetingContext(meeting, extracted);

    // Build calendar event description from context + agenda
    const updatedAgenda = [
      ...((meeting.agenda as string[]) ?? []),
      ...(extracted.agenda_items ?? []),
    ];
    const calendarDescription = buildCalendarDescription(
      meeting.notes ?? extracted.meeting_context_summary,
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
      extracted,
      calendarDescription,
      emailSubject: email.subject,
    };

    // Dispatch to intent handler (state machine runs, returns ComposerContext)
    let result: IntentHandlerResult;
    switch (extracted.intent) {
      case "schedule_new":
        result = await handleScheduleNew(ctx);
        break;
      case "confirm_time":
        result = await handleConfirmTime(ctx);
        break;
      case "reschedule":
        result = await handleReschedule(ctx);
        break;
      case "decline":
        result = await handleDecline(ctx);
        break;
      case "ask_for_more_times":
      case "propose_alternatives":
        result = await handleAskForMoreTimes(ctx);
        break;
      case "freeform_question":
      case "unrelated":
        result = await handleFreeformOrUnrelated(ctx, email.from);
        break;
      default:
        result = await handleFreeformOrUnrelated(ctx, email.from);
    }

    // Handle fixed system messages (no pipeline needed)
    if (result.skipPipeline && result.fixedMessage) {
      await sendThreadedReply({
        threadId: thread.id,
        to: result.fixedTo ?? replyTo,
        bcc: result.fixedBcc,
        text: result.fixedMessage,
      });
      return c.json({ status: "processed", intent: extracted.intent, pipeline: "skipped" });
    }

    // Agents 2+3: Compose → QC loop (up to 3 attempts)
    const pipelineResult = await runComposeQCLoop(extracted, result.composerContext, threadHistory);

    // Build email subject
    const emailSubject2 = thread.subject.startsWith("Re:")
      ? thread.subject
      : `Re: ${thread.subject}`;

    // Create draft in DB with final result
    const draft = await createDraft({
      meetingId: meeting.id,
      threadId: thread.id,
      intent: extracted.intent,
      toEmails: replyTo,
      bccEmails: [organizer.email],
      subject: emailSubject2,
      composedText: pipelineResult.finalText,
      extractedData: extracted,
      composerOutput: { composerContext: result.composerContext, attempts: pipelineResult.attempts },
    });

    // Update draft with final QC results
    await updateDraftWithQC(draft.id, pipelineResult.finalQC, "pending_approval");

    const qcResult = pipelineResult.finalQC;

    // Notify P.J. via iMessage
    await notifyDraftReady({
      type: pipelineResult.passed ? "draft_ready" : "draft_flagged",
      userId: organizer.id,
      meetingTitle: meeting.title ?? email.subject,
      shortCode: draft.shortCode,
      composedText: pipelineResult.finalText,
      recipients: replyTo,
      issues: qcResult.issues,
      questions: qcResult.questions,
      suggestions: qcResult.suggestions,
    });

    return c.json({
      status: "draft_pending",
      intent: extracted.intent,
      shortCode: draft.shortCode,
      qcVerdict: qcResult.verdict,
    });
  } catch (err) {
    console.error("=== WEBHOOK ERROR ===");
    console.error("Error:", err);
    console.error("Stack:", err instanceof Error ? err.stack : "no stack");

    // Try to notify the sender so the email doesn't silently disappear
    try {
      const email = parseInboundWebhook(body as Record<string, unknown>);
      const replySubject = email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`;
      const replyHeaders: Record<string, string> = {};
      if (email.messageId) replyHeaders["In-Reply-To"] = email.messageId;

      const isOAuthError = err instanceof Error && (
        err.message.includes("invalid_grant") ||
        err.message.includes("Token has been expired or revoked")
      );

      if (isOAuthError) {
        if (resolvedMeetingId) {
          await db
            .update(meetings)
            .set({ status: "awaiting_reauth", updatedAt: new Date() })
            .where(eq(meetings.id, resolvedMeetingId));
        }

        if (resolvedOrganizerId && resolvedMeetingId) {
          const failedMeeting = await db.query.meetings.findFirst({
            where: eq(meetings.id, resolvedMeetingId),
          });
          await notifyUser({
            type: "google_token_expired",
            userId: resolvedOrganizerId,
            meetingTitle: failedMeeting?.title ?? email.subject,
            meetingShortId: failedMeeting?.shortId ?? "",
          });
        }

        await sendEmail({
          to: [email.from],
          subject: replySubject,
          text: `Hey! I tried to check calendar availability for this meeting, but my connection to Google Calendar has expired. The organizer needs to reconnect their calendar at ${env.APP_URL}/settings.\n\nOnce that's done, I'll automatically pick back up and send available times.\n\n- Luca`,
          headers: replyHeaders,
        });
      } else {
        await sendEmail({
          to: [email.from],
          subject: replySubject,
          text: `Hey! Something went wrong while I was processing your email. I've logged the error and will try to get it sorted out.\n\nIn the meantime, you can try again by replying to this thread.\n\n- Luca`,
          headers: replyHeaders,
        });
      }
    } catch (replyErr) {
      console.error("Failed to send error reply:", replyErr);
    }

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

/** Update meeting with context summary, agenda items, and phone number from AI parsing. */
async function updateMeetingContext(
  meeting: typeof meetings.$inferSelect,
  extracted: { meeting_context_summary?: string; agenda_items?: string[]; phone_number?: string },
) {
  const meetingUpdates: Record<string, unknown> = { updatedAt: new Date() };

  if (extracted.meeting_context_summary && !meeting.notes) {
    meetingUpdates.notes = extracted.meeting_context_summary;
  }

  if (extracted.phone_number) {
    const phoneNote = `Phone: ${extracted.phone_number}`;
    const currentNotes = (meetingUpdates.notes as string) ?? meeting.notes ?? "";
    meetingUpdates.notes = currentNotes ? `${currentNotes}\n\n${phoneNote}` : phoneNote;
  }

  if (extracted.agenda_items && extracted.agenda_items.length > 0) {
    const existingAgenda = (meeting.agenda as string[]) ?? [];
    const newItems = extracted.agenda_items.filter(
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
