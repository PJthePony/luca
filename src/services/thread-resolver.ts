import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  meetings,
  emailThreads,
  participants,
  users,
} from "../db/schema.js";
import type { InboundEmail } from "../lib/mailgun.js";
import { env } from "../config.js";

export interface ResolvedThread {
  meeting: typeof meetings.$inferSelect;
  thread: typeof emailThreads.$inferSelect;
  organizer: typeof users.$inferSelect;
  isNewMeeting: boolean;
}

const LUCA_EMAIL = `luca@${env.MAILGUN_DOMAIN}`;

/**
 * Given an inbound email, find or create the associated meeting and thread.
 *
 * Matching strategy:
 * 1. Check In-Reply-To / References headers against stored message IDs.
 * 2. If no match and Luca is in CC (not To), treat as a new scheduling request.
 */
export async function resolveThread(
  email: InboundEmail,
): Promise<ResolvedThread | null> {
  // 1. Try to match against existing threads by message ID references
  const refIds = parseReferences(email.inReplyTo, email.references);

  if (refIds.length > 0) {
    const existingThread = await findThreadByMessageIds(refIds);
    if (existingThread) {
      // Append this message's ID to the thread
      await db
        .update(emailThreads)
        .set({
          messageIds: sql`array_append(${emailThreads.messageIds}, ${email.messageId}::text)`,
          lastMessageId: email.messageId,
          updatedAt: new Date(),
        })
        .where(eq(emailThreads.id, existingThread.id));

      const meeting = await db.query.meetings.findFirst({
        where: eq(meetings.id, existingThread.meetingId),
      });
      const organizer = meeting
        ? await db.query.users.findFirst({
            where: eq(users.id, meeting.organizerId),
          })
        : null;

      if (meeting && organizer) {
        return {
          meeting,
          thread: existingThread,
          organizer,
          isNewMeeting: false,
        };
      }
    }
  }

  // 2. New scheduling request — Luca should be in CC
  const isLucaInCc = email.cc.some(
    (addr) => addr.toLowerCase().includes(LUCA_EMAIL),
  );
  const isLucaInTo = email.to.some(
    (addr) => addr.toLowerCase().includes(LUCA_EMAIL),
  );

  if (!isLucaInCc && isLucaInTo) {
    // Someone emailed Luca directly without a thread context — can't resolve
    console.warn(
      `Direct email to Luca from ${email.from} with no thread context`,
    );
    return null;
  }

  if (!isLucaInCc) {
    return null;
  }

  // Find the organizer — the sender of this email must be a registered user
  const organizer = await db.query.users.findFirst({
    where: eq(users.email, email.from),
  });

  if (!organizer) {
    console.warn(`Email from unregistered user: ${email.from}`);
    return null;
  }

  // Create a new meeting
  const shortId = nanoid(8);
  const [meeting] = await db
    .insert(meetings)
    .values({
      shortId,
      organizerId: organizer.id,
      title: email.subject,
      status: "draft",
    })
    .returning();

  // Create participants — everyone on To/CC except Luca
  const allRecipients = [...email.to, ...email.cc].filter(
    (addr) => !addr.toLowerCase().includes(LUCA_EMAIL),
  );
  const uniqueEmails = [
    ...new Set(
      allRecipients.map((addr) => {
        const match = addr.match(/<(.+)>/);
        return (match ? match[1] : addr).toLowerCase().trim();
      }),
    ),
  ];

  // Add organizer as participant
  await db.insert(participants).values({
    meetingId: meeting.id,
    email: organizer.email,
    name: organizer.name,
    role: "organizer",
    rsvpStatus: "accepted",
    userId: organizer.id,
  });

  // Add other recipients as attendees
  for (const recipientEmail of uniqueEmails) {
    if (recipientEmail === organizer.email) continue;

    // Check if they're a Luca user
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, recipientEmail),
    });

    await db.insert(participants).values({
      meetingId: meeting.id,
      email: recipientEmail,
      role: "attendee",
      userId: existingUser?.id,
    });
  }

  // Create email thread
  const [thread] = await db
    .insert(emailThreads)
    .values({
      meetingId: meeting.id,
      subject: email.subject,
      messageIds: email.messageId ? [email.messageId] : [],
      lastMessageId: email.messageId || null,
    })
    .returning();

  return { meeting, thread, organizer, isNewMeeting: true };
}

/** Parse In-Reply-To and References headers into an array of message IDs. */
function parseReferences(inReplyTo: string, references: string): string[] {
  const ids = new Set<string>();

  if (inReplyTo) {
    const match = inReplyTo.match(/<([^>]+)>/);
    if (match) ids.add(`<${match[1]}>`);
    else ids.add(inReplyTo.trim());
  }

  if (references) {
    const matches = references.matchAll(/<([^>]+)>/g);
    for (const match of matches) {
      ids.add(`<${match[1]}>`);
    }
  }

  return [...ids];
}

/** Find an email thread that contains any of the given message IDs. */
async function findThreadByMessageIds(
  messageIds: string[],
): Promise<typeof emailThreads.$inferSelect | null> {
  const thread = await db.query.emailThreads.findFirst({
    where: sql`${emailThreads.messageIds} && ${sql`ARRAY[${sql.join(messageIds.map(id => sql`${id}`), sql`, `)}]::text[]`}`,
  });
  return thread ?? null;
}
