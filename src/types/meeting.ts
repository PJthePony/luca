/** Google OAuth tokens stored as JSONB on the user record. */
export interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
}

export enum MeetingStatus {
  DRAFT = "draft",
  PROPOSED = "proposed",
  CONFIRMED = "confirmed",
  RESCHEDULING = "rescheduling",
  CANCELLED = "cancelled",
}

export enum ParticipantRole {
  ORGANIZER = "organizer",
  ATTENDEE = "attendee",
}

export enum RsvpStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  DECLINED = "declined",
}

export enum EmailDirection {
  INBOUND = "inbound",
  OUTBOUND = "outbound",
}
