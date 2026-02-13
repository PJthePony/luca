export type Intent =
  | "schedule_new"
  | "confirm_time"
  | "decline"
  | "reschedule"
  | "propose_alternatives"
  | "ask_for_more_times"
  | "freeform_question"
  | "unrelated";

export interface TimePreference {
  type: "prefer" | "avoid" | "available" | "unavailable";
  description: string;
  start?: string;
  end?: string;
  recurrence?: string;
}

export interface MeetingDetails {
  title?: string;
  duration_minutes?: number;
  location?: string;
  notes?: string;
}

export interface ParsedEmail {
  intent: Intent;
  selected_time?: { start: string; end: string };
  time_preferences: TimePreference[];
  meeting_details: MeetingDetails;
  participants: string[];
  response_draft: string;
}
