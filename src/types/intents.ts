export type Intent =
  | "schedule_new"
  | "confirm_time"
  | "decline"
  | "reschedule"
  | "propose_alternatives"
  | "ask_for_more_times"
  | "freeform_question"
  | "unrelated"
  | "create_task";

export interface TimePreference {
  type: "prefer" | "avoid" | "available" | "unavailable";
  description: string;
  start?: string;
  end?: string;
  recurrence?: string;
  dayOfWeek?: number; // 0=Sunday, 6=Saturday
  timeOfDayStart?: string; // HH:MM, e.g. "12:00" for afternoons
  timeOfDayEnd?: string; // HH:MM, e.g. "17:00" for afternoons
}

export interface MeetingDetails {
  title?: string;
  duration_minutes?: number;
  location?: string;
  notes?: string;
  meeting_type_id?: string;
}

export interface ParsedEmail {
  intent: Intent;
  selected_time?: { start: string; end: string };
  time_preferences: TimePreference[];
  meeting_details: MeetingDetails;
  participants: string[];
  response_draft: string;
  meeting_context_summary?: string;
  agenda_items?: string[];
  phone_number?: string;
  task_title?: string;
  task_notes?: string;
  task_location?: string;
  task_activate_at?: string;
}

// ── 3-Agent Pipeline Types ──────────────────────────────────────────────

/** Agent 1 output: structured extraction only, no prose */
export interface ExtractedData {
  intent: Intent;
  selected_time?: { start: string; end: string };
  time_preferences: TimePreference[];
  meeting_details: MeetingDetails;
  participants: string[];
  meeting_context_summary?: string;
  agenda_items?: string[];
  phone_number?: string;
}

/** Context built by intent handlers for Agent 2 (Composer) */
export interface ComposerContext {
  intent: string;
  formattedSlots?: string;
  pickerLink?: string;
  locationOptions?: string;
  meetNote?: string;
  phoneNote?: string;
  agendaAck?: string;
  confirmedTime?: string;
  rescheduleLink?: string;
  meetingTitle?: string;
  organizerName?: string;
  participantNames?: string[];
  noSlotsMessage?: string;
  originalEmailSummary?: string;
  senderName?: string;
}

/** Agent 3 output: QC review result */
export interface QCResult {
  verdict: "pass" | "fail";
  issues: string[];
  questions: string[];
  suggestions: string[];
}

/** Return type from refactored intent handlers */
export interface IntentHandlerResult {
  composerContext: ComposerContext;
  /** If true, skip the composer/QC pipeline and send a fixed system message */
  skipPipeline?: boolean;
  /** Fixed message to send directly (when skipPipeline is true) */
  fixedMessage?: string;
  /** Recipients for the fixed message */
  fixedTo?: string[];
  /** BCC for the fixed message */
  fixedBcc?: string[];
}
