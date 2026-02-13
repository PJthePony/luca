import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config.js";
import type { ParsedEmail } from "../types/index.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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
            start: { type: "string", description: "ISO 8601 datetime" },
            end: { type: "string", description: "ISO 8601 datetime" },
            recurrence: { type: "string" },
          },
          required: ["type", "description"],
        },
        description: "Time constraints extracted from natural language",
      },
      meeting_details: {
        type: "object",
        properties: {
          title: { type: "string" },
          duration_minutes: { type: "number" },
          location: { type: "string" },
          notes: { type: "string" },
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
    },
    required: ["intent", "response_draft"],
  },
};

interface ParseContext {
  organizerName: string;
  organizerEmail: string;
  meetingStatus?: string;
  proposedTimes?: string[];
  threadHistory?: string;
  availabilityPreferences?: string;
}

export async function parseEmail(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  context: ParseContext,
): Promise<ParsedEmail> {
  const systemPrompt = `You are Luca, a friendly AI scheduling assistant. Your job is to parse incoming emails about meeting scheduling and extract structured data.

About the meeting:
- Organizer: ${context.organizerName} (${context.organizerEmail})
- Current meeting status: ${context.meetingStatus ?? "new request"}
${context.proposedTimes?.length ? `- Previously proposed times: ${context.proposedTimes.join(", ")}` : ""}
${context.availabilityPreferences ? `- Organizer's availability preferences: ${context.availabilityPreferences}` : ""}

${context.threadHistory ? `Previous messages in this thread:\n${context.threadHistory}` : ""}

Parse the email below and use the parse_scheduling_email tool to return structured data. Your response_draft should be warm, concise, and professional. Sign off as "Luca".`;

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
  };
}
