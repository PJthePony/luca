import { google, type calendar_v3 } from "googleapis";
import { env } from "../config.js";

const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID ?? "",
  env.GOOGLE_CLIENT_SECRET ?? "",
  env.GOOGLE_REDIRECT_URI ?? "",
);

export function getAuthUrl(userId: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    state: userId,
  });
}

export async function exchangeCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

function getCalendarClient(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
}) {
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
  tokens: { access_token?: string | null; refresh_token?: string | null },
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
  tokens: { access_token?: string | null; refresh_token?: string | null },
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
  tokens: { access_token?: string | null; refresh_token?: string | null },
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
  tokens: { access_token?: string | null; refresh_token?: string | null },
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

export async function deleteEvent(
  tokens: { access_token?: string | null; refresh_token?: string | null },
  eventId: string,
): Promise<void> {
  const calendar = getCalendarClient(tokens);

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
}
