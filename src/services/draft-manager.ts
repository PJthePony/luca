import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailDrafts } from "../db/schema.js";
import { sendThreadedReply } from "./email.js";

/** Generate a unique 4-character alphanumeric short code for draft identification. */
export async function generateShortCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid confusion
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const existing = await db.query.emailDrafts.findFirst({
      where: eq(emailDrafts.shortCode, code),
    });
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique short code after 10 attempts");
}

interface CreateDraftOptions {
  meetingId: string;
  threadId: string;
  intent: string;
  toEmails: string[];
  bccEmails?: string[];
  subject: string;
  composedText: string;
  extractedData: unknown;
  composerOutput?: unknown;
  isSimulated?: boolean;
}

/** Create a new email draft in pending_qc status. */
export async function createDraft(options: CreateDraftOptions) {
  const shortCode = await generateShortCode();

  const [draft] = await db
    .insert(emailDrafts)
    .values({
      meetingId: options.meetingId,
      threadId: options.threadId,
      shortCode,
      intent: options.intent,
      toEmails: options.toEmails,
      bccEmails: options.bccEmails ?? [],
      subject: options.subject,
      composedText: options.composedText,
      extractedData: options.extractedData,
      composerOutput: options.composerOutput,
      isSimulated: options.isSimulated ?? false,
    })
    .returning();

  return draft;
}

/** Update draft with QC results and set status accordingly. */
export async function updateDraftWithQC(
  draftId: string,
  qcResult: unknown,
  status: "pending_approval" | "pending_qc" | "sent",
) {
  await db
    .update(emailDrafts)
    .set({
      qcResult,
      status,
    })
    .where(eq(emailDrafts.id, draftId));
}

/** Find a draft by its short code. */
export async function findDraftByShortCode(shortCode: string) {
  return db.query.emailDrafts.findFirst({
    where: eq(emailDrafts.shortCode, shortCode.toUpperCase()),
  });
}

/** Approve a draft and send the email. */
export async function approveDraft(shortCode: string): Promise<{ success: boolean; error?: string }> {
  const draft = await findDraftByShortCode(shortCode);
  if (!draft) {
    return { success: false, error: `No draft found with code ${shortCode}` };
  }

  if (draft.status === "sent") {
    return { success: false, error: "This draft has already been sent" };
  }

  if (draft.isSimulated) {
    return { success: false, error: "Cannot send simulated drafts via approval — use the simulator" };
  }

  const textToSend = draft.editedText ?? draft.composedText;

  // Send the email
  await sendThreadedReply({
    threadId: draft.threadId,
    to: draft.toEmails,
    bcc: draft.bccEmails ?? [],
    text: textToSend,
  });

  // Mark as sent
  await db
    .update(emailDrafts)
    .set({
      status: "sent",
      reviewedAt: new Date(),
      sentAt: new Date(),
    })
    .where(eq(emailDrafts.id, draft.id));

  return { success: true };
}

/** Reject a draft (no email sent). */
export async function rejectDraft(shortCode: string): Promise<{ success: boolean; error?: string }> {
  const draft = await findDraftByShortCode(shortCode);
  if (!draft) {
    return { success: false, error: `No draft found with code ${shortCode}` };
  }

  if (draft.status === "sent") {
    return { success: false, error: "This draft has already been sent" };
  }

  await db
    .update(emailDrafts)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
    })
    .where(eq(emailDrafts.id, draft.id));

  return { success: true };
}

/** Edit a draft's text, then approve and send. */
export async function editAndSendDraft(
  shortCode: string,
  edits: string,
): Promise<{ success: boolean; error?: string }> {
  const draft = await findDraftByShortCode(shortCode);
  if (!draft) {
    return { success: false, error: `No draft found with code ${shortCode}` };
  }

  if (draft.status === "sent") {
    return { success: false, error: "This draft has already been sent" };
  }

  if (draft.isSimulated) {
    return { success: false, error: "Cannot send simulated drafts via approval — use the simulator" };
  }

  // Store the edits as the new text and send
  await db
    .update(emailDrafts)
    .set({
      editedText: edits,
      status: "edited",
      reviewedAt: new Date(),
    })
    .where(eq(emailDrafts.id, draft.id));

  await sendThreadedReply({
    threadId: draft.threadId,
    to: draft.toEmails,
    bcc: draft.bccEmails ?? [],
    text: edits,
  });

  await db
    .update(emailDrafts)
    .set({
      status: "sent",
      sentAt: new Date(),
    })
    .where(eq(emailDrafts.id, draft.id));

  return { success: true };
}
