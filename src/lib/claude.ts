import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config.js";
import type { ParsedEmail } from "../types/index.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface ParsedTaskEmail {
  task_title: string;
  task_notes?: string;
  task_location: string;
  task_activate_at?: string;
  response_draft: string;
}

const PARSE_EMAIL_TOOL: Anthropic.Tool = {
  name: "parse_scheduling_email",
  description:
    "Parse an incoming email and extract scheduling intent and details",
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
                "Day of week (0=Sunday, 1=Monday, ..., 6=Saturday). Set this whenever a weekday name is mentioned, even without a specific date.",
            },
          },
          required: ["type", "description"],
        },
        description:
          "Time constraints extracted from natural language. ALWAYS include ISO 8601 start/end when a specific day or time is mentioned.",
      },
      meeting_details: {
        type: "object",
        properties: {
          title: { type: "string" },
          duration_minutes: { type: "number" },
          location: { type: "string" },
          notes: { type: "string" },
          meeting_type: {
            type: "string",
            enum: [
              "coffee",
              "video_call",
              "lunch",
              "quick_chat",
              "phone_call",
              "drinks",
              "other",
            ],
            description:
              "Inferred type of meeting from context. coffee/tea/cafe → coffee, zoom/meet/video → video_call, lunch/dinner/brunch → lunch, quick chat/brief → quick_chat, call/phone → phone_call, drinks/happy hour/beer/wine/cocktails/bar → drinks, unclear → other.",
          },
        },
      },
      participants: {
        type: "array",
        items: { type: "string" },
        description: "Email addresses of participants mentioned",
      },
      response_draft: {
        type: "string",
        description:
          "A natural, friendly draft email response for Luca to send",
      },
      meeting_context_summary: {
        type: "string",
        description:
          "A 1-3 sentence summary of what this meeting is about, based on the email content and thread history. This will be added to the calendar event description.",
      },
      agenda_items: {
        type: "array",
        items: { type: "string" },
        description:
          "Specific topics, questions, or discussion items mentioned in the email. Extract these whenever the sender mentions things to discuss, cover, or talk about.",
      },
    },
    required: ["intent", "response_draft"],
  },
};

interface ParseContext {
  organizerName: string;
  organizerEmail: string;
  organizerTimezone?: string;
  meetingStatus?: string;
  proposedTimes?: string[];
  threadHistory?: string;
  availabilityPreferences?: string;
  existingAgenda?: string[];
}

export async function parseEmail(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  context: ParseContext,
): Promise<ParsedEmail> {
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

  const systemPrompt = `You are Luca, a friendly AI scheduling assistant. You help schedule meetings by email. When people CC you into an email thread, you find available times and coordinate.

IMPORTANT — who's who:
- ORGANIZER (your boss, whose calendar you manage): ${context.organizerName} (${context.organizerEmail})
- This email is from: ${senderName || senderEmail} <${senderEmail}>
${senderEmail === context.organizerEmail ? `- The sender IS the organizer. They are asking you to help schedule a meeting with the other people on this thread.` : `- The sender is a PARTICIPANT/GUEST, not the organizer.`}
- Meeting status: ${context.meetingStatus ?? "new request"}
- Organizer's timezone: ${tz}
- Current date/time in ${tz}: ${nowLocal}
${context.proposedTimes?.length ? `- Previously proposed times:\n${context.proposedTimes.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}` : ""}
${context.availabilityPreferences ? `- ${context.organizerName}'s availability preferences: ${context.availabilityPreferences}` : ""}
${context.existingAgenda?.length ? `- Current agenda items:\n${context.existingAgenda.map((a) => `  - ${a}`).join("\n")}` : ""}

${context.threadHistory ? `Previous messages in this thread:\n${context.threadHistory}` : ""}

Instructions:
- Parse the email and use the parse_scheduling_email tool.
- Your response_draft is the email Luca will send as a REPLY to the thread. It goes to the other participants (not the organizer, who is silently BCC'd).
- Address the participants, not the organizer.
- Do NOT sign off — the system appends "- Luca" automatically.

TIME PREFERENCE EXTRACTION (critical):
- When the sender mentions specific days or times (e.g., "Tuesday afternoon", "next Thursday morning", "after 2pm"), you MUST resolve them to concrete ISO 8601 date ranges using the organizer's timezone (${tz}).
- Example: "Tuesday afternoon" with current date ${nowLocal} → find next Tuesday, set start to 12:00 and end to 17:00 in ${tz}.
- Example: "next week" → set start to next Monday 00:00 and end to next Friday 23:59 in ${tz}.
- ALWAYS set the dayOfWeek field (0=Sunday through 6=Saturday) when a weekday name is mentioned.
- If no specific dates/times can be determined, still set the description field with the natural language.

MEETING TYPE INFERENCE:
- Infer the meeting type from context clues: coffee/tea/cafe → coffee, zoom/meet/video/call → video_call, lunch/dinner/brunch → lunch, quick chat/5 minutes/brief → quick_chat, call/phone → phone_call, drinks/happy hour/beer/wine/cocktails/bar → drinks.
- If duration is not explicitly stated, do NOT set duration_minutes — the system uses the meeting type's default.

MEETING CONTEXT & AGENDA:
- Always set meeting_context_summary: a 1-3 sentence summary of what this meeting is about.
- Extract agenda_items when the sender mentions topics, questions, or things to discuss.
- If the sender is adding to an existing agenda (replying with "let's also discuss X"), extract those new items.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [PARSE_EMAIL_TOOL],
    tool_choice: { type: "tool", name: "parse_scheduling_email" },
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
    throw new Error("Claude did not return a tool use response");
  }

  const input = toolUse.input as Record<string, unknown>;

  return {
    intent: input.intent as ParsedEmail["intent"],
    selected_time: input.selected_time as ParsedEmail["selected_time"],
    time_preferences:
      (input.time_preferences as ParsedEmail["time_preferences"]) ?? [],
    meeting_details:
      (input.meeting_details as ParsedEmail["meeting_details"]) ?? {},
    participants: (input.participants as ParsedEmail["participants"]) ?? [],
    response_draft: input.response_draft as string,
    meeting_context_summary: input.meeting_context_summary as
      | string
      | undefined,
    agenda_items: (input.agenda_items as string[]) ?? [],
  };
}

// ── Task Email Parsing ────────────────────────────────────────────────────────

const PARSE_TASK_EMAIL_TOOL: Anthropic.Tool = {
  name: "parse_task_email",
  description:
    "Parse an email sent directly to Luca and extract a task to create in the task manager",
  input_schema: {
    type: "object" as const,
    properties: {
      task_title: {
        type: "string",
        description:
          "A concise, action-oriented task title extracted from the email (e.g., 'Review Q4 budget proposal', 'Call dentist to reschedule').",
      },
      task_notes: {
        type: "string",
        description:
          "Additional context or details from the email body that provide useful notes for the task. Can be empty string if none.",
      },
      task_location: {
        type: "string",
        enum: [
          "today",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "this-week",
          "next-week",
          "later",
        ],
        description:
          "When this task should be scheduled. Map temporal cues from the email to a location value.",
      },
      task_activate_at: {
        type: "string",
        description:
          "ISO date (YYYY-MM-DD) for when a 'later' task should surface. Only set this when task_location is 'later' AND the sender mentioned a specific future date.",
      },
      response_draft: {
        type: "string",
        description:
          "A short, friendly confirmation message from Luca acknowledging the task was created. Mention the task title and when it's scheduled. Do NOT sign off — the system appends '- Luca'.",
      },
    },
    required: ["task_title", "task_location", "response_draft"],
  },
};

/**
 * Parse an email sent directly to Luca and extract a task.
 * Used for direct emails (To: luca@...) that are task/reminder requests,
 * not scheduling requests.
 */
export async function parseTaskEmail(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  organizerTimezone: string,
): Promise<ParsedTaskEmail> {
  const tz = organizerTimezone || "America/New_York";
  const now = new Date();
  const nowLocal = now.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const todayWeekday = now
    .toLocaleDateString("en-US", { weekday: "long", timeZone: tz })
    .toLowerCase();

  const systemPrompt = `You are Luca, a friendly AI assistant. Someone has emailed you directly to create a task or reminder. Your job is to extract a clear, actionable task from the email.

Current date/time: ${nowLocal} (${tz})
Today is ${todayWeekday}.

LOCATION MAPPING (critical — follow these rules exactly):
- "today", "asap", "urgent", or no time specified → "today"
- "tomorrow" → the next weekday name in lowercase (e.g., if today is Wednesday, use "thursday"; if today is Friday, use "monday")
- A specific weekday name for THIS week (today or a later day this week) → that day in lowercase (e.g., "wednesday")
- A weekday name for NEXT week (e.g., "next Tuesday", "next Monday") → "next-week"
- "this week" / "sometime this week" → "this-week"
- "next week" → "next-week"
- A specific date more than 2 weeks out → "later" AND set task_activate_at to that date (YYYY-MM-DD)
- "later", "whenever", "no rush", "low priority" → "later" (do NOT set task_activate_at)

TASK EXTRACTION:
- Make the task title concise and action-oriented
- Pull any relevant details into task_notes
- If the subject line IS the task, use it as the title
- If the email body adds context, summarize it into notes

RESPONSE:
- Write a brief, warm confirmation. Mention the task title and when it's scheduled.
- Example: "Got it! I've added 'Review Q4 budget' to your tasks for Thursday."
- Example for later: "Added 'Update the wiki' to your backlog — no rush."`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 512,
    system: systemPrompt,
    tools: [PARSE_TASK_EMAIL_TOOL],
    tool_choice: { type: "tool", name: "parse_task_email" },
    messages: [
      {
        role: "user",
        content: `From: ${senderName || senderEmail} <${senderEmail}>\nSubject: ${subject}\n\n${emailBody}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use",
  ) as Anthropic.ToolUseBlock | undefined;

  if (!toolUse) {
    throw new Error("Claude did not return a tool use response for task parsing");
  }

  const input = toolUse.input as Record<string, unknown>;

  return {
    task_title: input.task_title as string,
    task_notes: (input.task_notes as string) || undefined,
    task_location: input.task_location as string,
    task_activate_at: (input.task_activate_at as string) || undefined,
    response_draft: input.response_draft as string,
  };
}
