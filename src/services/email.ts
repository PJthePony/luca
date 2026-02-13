import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailThreads, emailMessages } from "../db/schema.js";
import { sendEmail } from "../lib/mailgun.js";
import { env } from "../config.js";
import { EmailDirection } from "../types/index.js";

interface SendThreadedReplyOptions {
  threadId: string;
  to: string[];
  bcc?: string[];
  text: string;
  html?: string;
}

/**
 * Send a reply within an existing email thread.
 * Sets correct In-Reply-To and References headers for threading.
 * Returns the Mailgun message ID.
 */
export async function sendThreadedReply(
  options: SendThreadedReplyOptions,
): Promise<string> {
  const thread = await db.query.emailThreads.findFirst({
    where: eq(emailThreads.id, options.threadId),
  });

  if (!thread) {
    throw new Error(`Thread ${options.threadId} not found`);
  }

  // Build threading headers
  const headers: Record<string, string> = {};

  if (thread.lastMessageId) {
    headers["In-Reply-To"] = thread.lastMessageId;
  }

  if (thread.messageIds.length > 0) {
    headers["References"] = thread.messageIds.join(" ");
  }

  // Send via Mailgun
  const subject = thread.subject.startsWith("Re:")
    ? thread.subject
    : `Re: ${thread.subject}`;

  const messageId = await sendEmail({
    to: options.to,
    bcc: options.bcc,
    subject,
    text: options.text,
    html: options.html,
    headers,
  });

  // Normalize the returned message ID (Mailgun wraps it in < >)
  const normalizedId = messageId.startsWith("<")
    ? messageId
    : `<${messageId}>`;

  // Store outbound message
  await db.insert(emailMessages).values({
    threadId: options.threadId,
    messageIdHeader: normalizedId,
    fromEmail: `luca@${env.MAILGUN_DOMAIN}`,
    fromName: "Luca",
    toEmails: options.to,
    bccEmails: options.bcc ?? [],
    subject,
    bodyText: options.text,
    direction: EmailDirection.OUTBOUND,
  });

  // Update thread
  await db
    .update(emailThreads)
    .set({
      messageIds: sql`array_append(${emailThreads.messageIds}, ${normalizedId})`,
      lastMessageId: normalizedId,
      bccMoved: true,
      updatedAt: new Date(),
    })
    .where(eq(emailThreads.id, options.threadId));

  return normalizedId;
}
