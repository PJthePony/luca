import { google, type calendar_v3 } from "googleapis";
import { env } from "../config.js";
import type { GoogleTokens } from "../types/index.js";

const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID ?? "",
  env.GOOGLE_CLIENT_SECRET ?? "",
  env.GOOGLE_REDIRECT_URI ?? "",
);

export function getAuthUrl(userId: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
    state: userId,
  });
}

export async function exchangeCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

function getCalendarClient(tokens: GoogleTokens) {
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials(tokens);
  return google.calendar({ version: "v3", auth: client });
}

export interface FreeBusyResult {
  calendarId: string;
  busy: { start: string; end: string }[];
}

export async function queryFreeBusy(
  tokens: GoogleTokens,
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date,
): Promise<FreeBusyResult[]> {
  const calendar = getCalendarClient(tokens);

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: calendarIds.map((id) => ({ id })),
    },
  });

  const calendars = response.data.calendars ?? {};

  return Object.entries(calendars).map(([id, data]) => ({
    calendarId: id,
    busy:
      data.busy?.map((b) => ({
        start: b.start ?? "",
        end: b.end ?? "",
      })) ?? [],
  }));
}

export async function createTentativeEvent(
  tokens: GoogleTokens,
  event: {
    summary: string;
    start: Date;
    end: Date;
    attendees?: string[];
    description?: string;
    addGoogleMeet?: boolean;
    location?: string;
    timeZone?: string;
  },
): Promise<{ eventId: string; meetLink?: string }> {
  const calendar = getCalendarClient(tokens);

  const requestBody: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    status: "tentative",
    start: { dateTime: event.start.toISOString(), timeZone: event.timeZone ?? "America/New_York" },
    end: { dateTime: event.end.toISOString(), timeZone: event.timeZone ?? "America/New_York" },
    attendees: event.attendees?.map((email) => ({ email })),
    transparency: "opaque",
  };

  if (event.location) {
    requestBody.location = event.location;
  }

  if (event.addGoogleMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `luca-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const response = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: event.addGoogleMeet ? 1 : undefined,
    requestBody,
  });

  return {
    eventId: response.data.id ?? "",
    meetLink: response.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri ?? undefined,
  };
}

export async function confirmEvent(
  tokens: GoogleTokens,
  eventId: string,
  attendees?: string[],
  description?: string,
  location?: string,
  addGoogleMeet?: boolean,
  timeZone?: string,
): Promise<{ meetLink?: string }> {
  const calendar = getCalendarClient(tokens);

  // Get the current event to clean up the summary and preserve existing data
  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId,
  });

  const summary = (existing.data.summary ?? "").replace(/^\[Tentative\]\s*/, "");

  const tz = timeZone ?? "America/New_York";

  const patchBody: Record<string, unknown> = {
    status: "confirmed",
    summary,
    attendees: attendees?.map((email) => ({ email })),
    // Re-set start/end with explicit timeZone to avoid timezone drift
    start: { ...existing.data.start, timeZone: tz },
    end: { ...existing.data.end, timeZone: tz },
  };

  // Use provided description, or preserve existing one
  if (description) {
    patchBody.description = description;
  }

  if (location) {
    patchBody.location = location;
  }

  // Add Google Meet if requested and not already present
  if (addGoogleMeet && !existing.data.conferenceData) {
    patchBody.conferenceData = {
      createRequest: {
        requestId: `luca-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    conferenceDataVersion: addGoogleMeet ? 1 : undefined,
    requestBody: patchBody,
  });

  return {
    meetLink: response.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri ?? undefined,
  };
}

export interface CalendarListEntry {
  calendarId: string;
  summary: string;
  isPrimary: boolean;
}

/**
 * List all calendars the user has access to.
 */
export async function listCalendars(
  tokens: GoogleTokens,
): Promise<CalendarListEntry[]> {
  const calendar = getCalendarClient(tokens);

  const response = await calendar.calendarList.list({
    minAccessRole: "reader",
  });

  return (response.data.items ?? []).map((item) => ({
    calendarId: item.id ?? "",
    summary: item.summary ?? item.id ?? "Unknown",
    isPrimary: item.primary ?? false,
  }));
}

/**
 * Create a private "External Meeting" hold on the organizer's calendar,
 * silently inviting the work email so it blocks their work calendar.
 * No meeting details are shared — just a busy block.
 */
export async function createBusyHold(
  tokens: GoogleTokens,
  event: { start: Date; end: Date; workEmail: string; timeZone?: string },
): Promise<string> {
  const calendar = getCalendarClient(tokens);

  const response = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "none",
    requestBody: {
      summary: "External Meeting",
      description: "Generated by Luca",
      start: { dateTime: event.start.toISOString(), timeZone: event.timeZone ?? "America/New_York" },
      end: { dateTime: event.end.toISOString(), timeZone: event.timeZone ?? "America/New_York" },
      attendees: [{ email: event.workEmail, responseStatus: "accepted" }],
      visibility: "private",
      transparency: "opaque",
      status: "confirmed",
    },
  });

  return response.data.id ?? "";
}

export interface CalendarEvent {
  calendarId: string;
  eventId: string;
  summary: string;
  start: Date;
  end: Date;
}

/**
 * List events from a specific calendar within a time range.
 * Returns actual event details (not just busy/free) so we can show
 * what's blocking availability.
 */
export async function listEvents(
  tokens: GoogleTokens,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient(tokens);

  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });

    for (const item of response.data.items ?? []) {
      if (item.status === "cancelled") continue;
      // Skip transparent (free) events
      if (item.transparency === "transparent") continue;

      let start: Date;
      let end: Date;

      if (item.start?.dateTime && item.end?.dateTime) {
        // Timed event
        start = new Date(item.start.dateTime);
        end = new Date(item.end.dateTime);
      } else if (item.start?.date && item.end?.date) {
        // All-day event — dates are YYYY-MM-DD, end date is exclusive
        // Convert to full-day UTC range (midnight to midnight)
        start = new Date(item.start.date + "T00:00:00Z");
        end = new Date(item.end.date + "T00:00:00Z");
      } else {
        continue;
      }

      events.push({
        calendarId,
        eventId: item.id ?? "",
        summary: item.summary ?? "(No title)",
        start,
        end,
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

function getGmailClient(tokens: GoogleTokens) {
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials(tokens);
  return google.gmail({ version: "v1", auth: client });
}

/**
 * Create a Gmail draft. Returns the draft ID.
 */
export async function createGmailDraft(
  tokens: GoogleTokens,
  to: string[],
  subject: string,
  body: string,
  bcc?: string[],
): Promise<{ draftId: string }> {
  const gmail = getGmailClient(tokens);

  const headers = [
    `To: ${to.join(", ")}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
  ];
  if (bcc && bcc.length > 0) {
    headers.push(`Bcc: ${bcc.join(", ")}`);
  }

  const raw = Buffer.from(
    headers.join("\r\n") + "\r\n\r\n" + body,
  ).toString("base64url");

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw },
    },
  });

  return { draftId: response.data.id ?? "" };
}

export async function deleteEvent(
  tokens: GoogleTokens,
  eventId: string,
): Promise<void> {
  const calendar = getCalendarClient(tokens);

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
}
