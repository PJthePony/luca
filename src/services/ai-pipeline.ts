import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config.js";
import type { ExtractedData, ComposerContext, QCResult } from "../types/index.js";
import type { UserMeetingType, ParseContext } from "../lib/claude.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ── Agent 1: Extractor ──────────────────────────────────────────────────

function buildExtractorTool(): Anthropic.Tool {
  return {
    name: "extract_scheduling_data",
    description:
      "Extract structured scheduling data from an email. Do NOT write any response text.",
    input_schema: {
      type: "object" as const,
      properties: {
        intent: {
          type: "string",
          enum: [
            "schedule_new",
            "confirm_time",
            "decline",
            "reschedule",
            "propose_alternatives",
            "ask_for_more_times",
            "freeform_question",
            "unrelated",
          ],
          description: "The primary intent of the email sender",
        },
        selected_time: {
          type: "object",
          properties: {
            start: { type: "string", description: "ISO 8601 datetime" },
            end: { type: "string", description: "ISO 8601 datetime" },
          },
          required: ["start", "end"],
          description: "If confirming, the specific time slot selected",
        },
        time_preferences: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["prefer", "avoid", "available", "unavailable"],
              },
              description: { type: "string" },
              start: {
                type: "string",
                description:
                  "ISO 8601 datetime with timezone offset. REQUIRED when a specific day/time is mentioned.",
              },
              end: {
                type: "string",
                description:
                  "ISO 8601 datetime with timezone offset. REQUIRED when a specific day/time is mentioned.",
              },
              recurrence: { type: "string" },
              dayOfWeek: {
                type: "number",
                description:
                  "Day of week (0=Sunday, 1=Monday, ..., 6=Saturday). Set this whenever a weekday name is mentioned.",
              },
              timeOfDayStart: {
                type: "string",
                description:
                  'HH:MM format. For general time-of-day constraints (e.g., "mornings" → "08:00").',
              },
              timeOfDayEnd: {
                type: "string",
                description:
                  'HH:MM format. End of the time-of-day window (e.g., "mornings" → "12:00").',
              },
            },
            required: ["type", "description"],
          },
          description:
            "Time constraints extracted from natural language.",
        },
        meeting_details: {
          type: "object",
          properties: {
            title: { type: "string" },
            duration_minutes: { type: "number" },
            location: { type: "string" },
            notes: { type: "string" },
            meeting_type_id: {
              type: "string",
              description:
                "The UUID of the matching meeting type from the organizer's configured list.",
            },
          },
        },
        participants: {
          type: "array",
          items: { type: "string" },
          description: "Email addresses of participants mentioned",
        },
        meeting_context_summary: {
          type: "string",
          description:
            "A 1-3 sentence summary of what this meeting is about.",
        },
        agenda_items: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific topics, questions, or discussion items mentioned.",
        },
        phone_number: {
          type: "string",
          description:
            "A phone number shared by the sender, if any.",
        },
      },
      required: ["intent"],
    },
  };
}

export async function extractIntent(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  context: ParseContext,
): Promise<ExtractedData> {
  const tz = context.organizerTimezone ?? "America/New_York";
  const nowLocal = new Date().toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const systemPrompt = `You are a data extraction system for a scheduling assistant called Luca. Your ONLY job is to extract structured data from emails. Do NOT write any email response or prose.

IMPORTANT — who's who:
- ORGANIZER (whose calendar you manage): ${context.organizerName} (${context.organizerEmail})
- This email is from: ${senderName || senderEmail} <${senderEmail}>
${senderEmail === context.organizerEmail ? `- The sender IS the organizer. They are asking to schedule a meeting with the other people on this thread.` : `- The sender is a PARTICIPANT/GUEST, not the organizer.`}
- Meeting status: ${context.meetingStatus ?? "new request"}
- Organizer's timezone: ${tz}
- Current date/time in ${tz}: ${nowLocal}
${context.proposedTimes?.length ? `- Previously proposed times:\n${context.proposedTimes.map((t: string, i: number) => `  ${i + 1}. ${t}`).join("\n")}` : ""}
${context.availabilityPreferences ? `- ${context.organizerName}'s availability preferences: ${context.availabilityPreferences}` : ""}
${context.existingAgenda?.length ? `- Current agenda items:\n${context.existingAgenda.map((a: string) => `  - ${a}`).join("\n")}` : ""}

${context.threadHistory ? `Previous messages in this thread:\n${context.threadHistory}` : ""}

HOW LUCA WORKS (critical context):
- The organizer CC's Luca on an email to a friend/colleague. Luca then takes over and handles all scheduling communication DIRECTLY with the recipient.
- Luca ALWAYS replies to the recipient/participant, NEVER to the organizer. The organizer is silently BCC'd.
- When the meeting status is "proposed", Luca has already sent time slot proposals to the recipient.
- If the recipient replies with NEW times or preferences, this is an IMPLICIT REJECTION of the previously proposed times. The intent should be "propose_alternatives" or "ask_for_more_times" — Luca needs to find new slots that match what the recipient suggested.
- The recipient suggesting their own availability (e.g. "I'm free Thursday 11am or Friday 2/3") means the old proposals didn't work. Luca should cross-check those suggested times against the organizer's calendar and respond with times that work for BOTH parties.

Instructions:
- Extract ONLY structured data. Do not generate any email text.
- Use the extract_scheduling_data tool to return your analysis.

TIME PREFERENCE EXTRACTION (critical):
- When the sender mentions specific days or times, resolve them to concrete ISO 8601 date ranges using the organizer's timezone (${tz}).
- ALWAYS set the dayOfWeek field (0=Sunday through 6=Saturday) when a weekday name is mentioned.
- Use "unavailable" or "avoid" types for things they CAN'T do.
- Use "prefer" or "available" for things they CAN do.
- When a participant suggests specific times (e.g. "How about Thursday at 11am?"), mark those as "prefer" type preferences. The previously proposed times that were NOT selected should be considered implicitly rejected.

TIME-OF-DAY PREFERENCES (use timeOfDayStart/timeOfDayEnd):
- "mornings" → timeOfDayStart: "08:00", timeOfDayEnd: "12:00"
- "afternoons" → timeOfDayStart: "12:00", timeOfDayEnd: "17:00"
- "after 3pm" → timeOfDayStart: "15:00", timeOfDayEnd: "23:59"
- "before noon" → timeOfDayStart: "00:00", timeOfDayEnd: "12:00"
- "evenings" → timeOfDayStart: "17:00", timeOfDayEnd: "21:00"

MEETING TYPE INFERENCE:
${context.userMeetingTypes?.length ? `The organizer has these meeting types configured:\n${context.userMeetingTypes.map((mt: { id: string; name: string; isOnline: boolean; defaultDuration: number }) => `  - ${mt.id}: "${mt.name}" (${mt.isOnline ? "online" : "in-person"}, ${mt.defaultDuration} min)`).join("\n")}\nIf none match, omit meeting_type_id.` : "No meeting types are configured — omit meeting_type_id."}
- If duration is not explicitly stated, do NOT set duration_minutes.

MEETING CONTEXT & AGENDA:
- Always set meeting_context_summary: a 1-3 sentence summary of what this meeting is about.
- Extract agenda_items when the sender mentions topics, questions, or things to discuss.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [buildExtractorTool()],
    tool_choice: { type: "tool", name: "extract_scheduling_data" },
    messages: [
      {
        role: "user",
        content: `From: ${senderName} <${senderEmail}>\nSubject: ${subject}\n\n${emailBody}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use",
  ) as Anthropic.ToolUseBlock | undefined;

  if (!toolUse) {
    throw new Error("Extractor agent did not return a tool use response");
  }

  const input = toolUse.input as Record<string, unknown>;

  return {
    intent: input.intent as ExtractedData["intent"],
    selected_time: input.selected_time as ExtractedData["selected_time"],
    time_preferences:
      (input.time_preferences as ExtractedData["time_preferences"]) ?? [],
    meeting_details:
      (input.meeting_details as ExtractedData["meeting_details"]) ?? {},
    participants: (input.participants as ExtractedData["participants"]) ?? [],
    meeting_context_summary: input.meeting_context_summary as string | undefined,
    agenda_items: (input.agenda_items as string[]) ?? [],
    phone_number: input.phone_number as string | undefined,
  };
}

// ── Agent 2: Composer ───────────────────────────────────────────────────

function buildComposerTool(): Anthropic.Tool {
  return {
    name: "compose_email",
    description: "Compose the full email body for Luca to send.",
    input_schema: {
      type: "object" as const,
      properties: {
        email_body: {
          type: "string",
          description:
            "The complete email body, including all required sections. End with '- Luca'.",
        },
      },
      required: ["email_body"],
    },
  };
}

export async function composeEmail(
  extracted: ExtractedData,
  composerCtx: ComposerContext,
  threadHistory: string,
  qcFeedback?: { previousDraft: string; issues: string[]; suggestions: string[] },
): Promise<string> {
  const sections: string[] = [];

  if (composerCtx.formattedSlots) {
    sections.push(`TIME SLOTS (must appear exactly as written):\n${composerCtx.formattedSlots}`);
  }
  if (composerCtx.confirmedTime) {
    sections.push(`CONFIRMED TIME: ${composerCtx.confirmedTime}`);
  }
  if (composerCtx.pickerLink) {
    sections.push(`PICKER LINK: ${composerCtx.pickerLink}`);
  }
  if (composerCtx.rescheduleLink) {
    sections.push(`RESCHEDULE LINK: ${composerCtx.rescheduleLink}`);
  }
  if (composerCtx.locationOptions) {
    sections.push(`LOCATION OPTIONS:\n${composerCtx.locationOptions}`);
  }
  if (composerCtx.meetNote) {
    sections.push(`GOOGLE MEET NOTE: ${composerCtx.meetNote}`);
  }
  if (composerCtx.phoneNote) {
    sections.push(`PHONE NOTE: ${composerCtx.phoneNote}`);
  }
  if (composerCtx.agendaAck) {
    sections.push(`AGENDA NOTE: ${composerCtx.agendaAck}`);
  }
  if (composerCtx.noSlotsMessage) {
    sections.push(`NO SLOTS MESSAGE: ${composerCtx.noSlotsMessage}`);
  }

  const factualContent = sections.length > 0
    ? `\n\nFACTUAL CONTENT THAT MUST APPEAR IN THE EMAIL:\n${sections.join("\n\n")}`
    : "";

  const systemPrompt = `You are composing a scheduling email on behalf of Luca, an AI scheduling assistant. Your job is to write a natural, professional email that incorporates all the required factual content.

HOW LUCA WORKS:
- The organizer CC'd Luca on an email to a recipient. Luca now handles all scheduling communication directly with the recipient.
- You are ALWAYS writing TO the recipient, never to the organizer. The organizer is silently BCC'd.
- When a recipient suggests new times, they are implicitly rejecting any previously proposed times. Acknowledge their suggestions and present the new time slots provided in the factual content (which have already been cross-checked against the organizer's availability).

CONTEXT:
- Intent: ${composerCtx.intent}
- Meeting: ${composerCtx.meetingTitle ?? "Untitled meeting"}
- Organizer: ${composerCtx.organizerName ?? "Unknown"}
- Writing to: ${composerCtx.participantNames?.join(", ") ?? composerCtx.senderName ?? "participants"}

${threadHistory ? `THREAD HISTORY (for tone/context — do NOT contradict anything here):\n${threadHistory}` : ""}
${factualContent}

RULES:
1. Write a short, friendly greeting that acknowledges the sender's message.
2. Include ALL factual content provided above. Copy times, links, and names EXACTLY — do not rephrase or reformat them.
3. For time slots: present them as a numbered list, then add "Just reply with your preferred option, or let me know if none of these work and I'll find more times."
4. End with "- Luca" on its own line.
5. Be concise. No filler. No exclamation marks. Professional but warm.
6. NEVER invent times, dates, names, or links. Use ONLY what is provided.
7. Do NOT mention the organizer by name in the email — they are silently BCC'd.
8. If this is a freeform/unrelated message, write a helpful but brief response.`;

  // Build messages — on retries, use multi-turn so the model sees its
  // own previous draft and the QC feedback as a natural conversation.
  const messages: Anthropic.MessageParam[] = [];

  if (qcFeedback) {
    // Turn 1: original compose request
    messages.push({
      role: "user",
      content: `Compose the email for the "${composerCtx.intent}" intent.`,
    });
    // Turn 2: the model's previous (failed) draft
    messages.push({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "prev_draft",
          name: "compose_email",
          input: { email_body: qcFeedback.previousDraft },
        },
      ],
    });
    // Turn 3: QC feedback as tool result + user instruction to fix
    const issueList = qcFeedback.issues.map((issue) => `- ${issue}`).join("\n");
    const suggestionList = qcFeedback.suggestions.length > 0
      ? `\nSuggestions to incorporate:\n${qcFeedback.suggestions.map((s) => `- ${s}`).join("\n")}`
      : "";
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "prev_draft",
          content: "Draft submitted for review.",
        },
        {
          type: "text",
          text: `Quality control REJECTED this draft. You MUST fix every issue below and write a completely new draft.\n\nISSUES:\n${issueList}${suggestionList}\n\nWrite a new draft that addresses ALL issues. Do not repeat the same mistakes. Use the compose_email tool.`,
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Compose the email for the "${composerCtx.intent}" intent.`,
    });
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [buildComposerTool()],
    tool_choice: { type: "tool", name: "compose_email" },
    messages,
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use",
  ) as Anthropic.ToolUseBlock | undefined;

  if (!toolUse) {
    throw new Error("Composer agent did not return a tool use response");
  }

  const input = toolUse.input as { email_body: string };
  return input.email_body;
}

// ── Agent 3: QC Reviewer ────────────────────────────────────────────────

function buildQCTool(): Anthropic.Tool {
  return {
    name: "review_email",
    description: "Review a draft email for quality before sending to a professional contact.",
    input_schema: {
      type: "object" as const,
      properties: {
        verdict: {
          type: "string",
          enum: ["pass", "fail"],
          description: "Whether the email is ready to send.",
        },
        issues: {
          type: "array",
          items: { type: "string" },
          description: "Specific problems found (empty if passing).",
        },
        questions: {
          type: "array",
          items: { type: "string" },
          description: "Questions for the organizer that can't be resolved from context.",
        },
        suggestions: {
          type: "array",
          items: { type: "string" },
          description: "Optional non-blocking improvement suggestions.",
        },
      },
      required: ["verdict", "issues", "questions", "suggestions"],
    },
  };
}

export async function reviewEmail(
  composedDraft: string,
  threadHistory: string,
  extracted: ExtractedData,
  composerCtx: ComposerContext,
): Promise<QCResult> {
  const systemPrompt = `You are a quality control reviewer for Luca, an AI scheduling assistant. Your job is to catch errors before an email is sent to a professional contact. This is critical — bad emails damage trust and are embarrassing.

HOW LUCA WORKS (you must understand this to review correctly):
- The organizer (${composerCtx.organizerName ?? "the organizer"}) CC's Luca on an email to a friend/colleague (the recipient).
- Luca then handles ALL scheduling communication DIRECTLY with the recipient. Luca ALWAYS replies to the recipient, NEVER to the organizer. The organizer is silently BCC'd.
- So every draft you review is addressed TO the recipient/participant — this is correct behavior, not an error.
- When a recipient suggests new times (e.g. "How about Thursday 11am?"), they are implicitly rejecting the previously proposed times. Luca should cross-check the recipient's suggested times against the organizer's calendar and propose times that work for both.

Review the draft email against the thread history and extracted data. Check for:

1. CONTRADICTIONS: Does the email say something that conflicts with what was said earlier in the thread?
2. WRONG FACTS: Are any times, dates, names, or links incorrect or mismatched from the source data?
3. MISSING INFO: Is any required information missing (e.g., time slots that should be listed, a picker link that should be included)?
4. TONE: Is the tone professional and appropriate? No over-enthusiasm, no awkwardness.
5. LOGIC: Does the response make sense given what the sender asked? (e.g., if they suggested new times, are we checking those against availability rather than re-proposing our own?)
6. COHERENCE: Does the email read naturally? No sentence fragments, no repeated information, no contradictory statements within the email itself.
7. SIGN-OFF: Does it end with "- Luca"?

IMPORTANT — do NOT flag these as issues:
- The email being addressed to the recipient (not the organizer) — this is correct, Luca always writes to the recipient.
- The organizer not being mentioned by name — they are silently BCC'd.

If EVERYTHING looks good, mark as "pass" with empty issues.
If ANY issue is found, mark as "fail" and describe each issue clearly.
If you have questions that need the organizer's input, list them in "questions".
Non-blocking improvements go in "suggestions".

Be strict about real issues. But do not flag correct workflow behavior as an error.`;

  const userContent = `DRAFT EMAIL TO REVIEW:
---
${composedDraft}
---

EXTRACTED INTENT: ${extracted.intent}
${extracted.selected_time ? `SELECTED TIME: ${extracted.selected_time.start} to ${extracted.selected_time.end}` : ""}
${extracted.meeting_context_summary ? `MEETING CONTEXT: ${extracted.meeting_context_summary}` : ""}

COMPOSER CONTEXT (factual data that should appear in the email):
- Intent: ${composerCtx.intent}
${composerCtx.formattedSlots ? `- Time slots:\n${composerCtx.formattedSlots}` : ""}
${composerCtx.confirmedTime ? `- Confirmed time: ${composerCtx.confirmedTime}` : ""}
${composerCtx.pickerLink ? `- Picker link: ${composerCtx.pickerLink}` : ""}
${composerCtx.rescheduleLink ? `- Reschedule link: ${composerCtx.rescheduleLink}` : ""}
${composerCtx.locationOptions ? `- Location options: ${composerCtx.locationOptions}` : ""}
${composerCtx.meetNote ? `- Meet note: ${composerCtx.meetNote}` : ""}
${composerCtx.phoneNote ? `- Phone note: ${composerCtx.phoneNote}` : ""}

${threadHistory ? `FULL THREAD HISTORY:\n${threadHistory}` : "No prior messages in thread."}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [buildQCTool()],
    tool_choice: { type: "tool", name: "review_email" },
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use",
  ) as Anthropic.ToolUseBlock | undefined;

  if (!toolUse) {
    throw new Error("QC agent did not return a tool use response");
  }

  const input = toolUse.input as QCResult;

  return {
    verdict: input.verdict,
    issues: input.issues ?? [],
    questions: input.questions ?? [],
    suggestions: input.suggestions ?? [],
  };
}

// ── Compose → QC Loop ───────────────────────────────────────────────────

const MAX_QC_ATTEMPTS = 3;

export interface PipelineAttempt {
  attempt: number;
  composedText: string;
  qcResult: QCResult;
  composeTiming: string;
  qcTiming: string;
}

export interface PipelineResult {
  finalText: string;
  finalQC: QCResult;
  attempts: PipelineAttempt[];
  passed: boolean;
}

/**
 * Run the Compose → QC loop up to MAX_QC_ATTEMPTS times.
 * If QC fails, feeds issues back to the Composer for a rewrite.
 * Returns the final result — either a passing draft or the best attempt after exhausting retries.
 */
export async function runComposeQCLoop(
  extracted: ExtractedData,
  composerCtx: ComposerContext,
  threadHistory: string,
): Promise<PipelineResult> {
  const attempts: PipelineAttempt[] = [];
  let lastDraft = "";
  let lastQC: QCResult = { verdict: "fail", issues: [], questions: [], suggestions: [] };

  for (let attempt = 1; attempt <= MAX_QC_ATTEMPTS; attempt++) {
    // Compose (with QC feedback on retries)
    const composeStart = Date.now();
    const qcFeedback = attempt > 1
      ? { previousDraft: lastDraft, issues: lastQC.issues, suggestions: lastQC.suggestions }
      : undefined;
    const composedText = await composeEmail(extracted, composerCtx, threadHistory, qcFeedback);
    const composeTiming = `${Date.now() - composeStart}ms`;

    // QC
    const qcStart = Date.now();
    const qcResult = await reviewEmail(composedText, threadHistory, extracted, composerCtx);
    const qcTiming = `${Date.now() - qcStart}ms`;

    attempts.push({ attempt, composedText, qcResult, composeTiming, qcTiming });
    lastDraft = composedText;
    lastQC = qcResult;

    // If QC passes or only has questions (no hard issues), stop
    if (qcResult.verdict === "pass") {
      return { finalText: composedText, finalQC: qcResult, attempts, passed: true };
    }

    // If QC has questions but no issues, treat as needing human input — don't retry
    if (qcResult.issues.length === 0 && qcResult.questions.length > 0) {
      return { finalText: composedText, finalQC: qcResult, attempts, passed: false };
    }

    console.log(`QC attempt ${attempt}/${MAX_QC_ATTEMPTS} failed: ${qcResult.issues.join("; ")}`);
  }

  // Exhausted retries — return last attempt for human review
  return { finalText: lastDraft, finalQC: lastQC, attempts, passed: false };
}
