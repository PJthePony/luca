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
  },
): Promise<string> {
  const calendar = getCalendarClient(tokens);

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.summary,
      description: event.description,
      status: "tentative",
      start: { dateTime: event.start.toISOString() },
      end: { dateTime: event.end.toISOString() },
      attendees: event.attendees?.map((email) => ({ email })),
      transparency: "opaque",
    },
  });

  return response.data.id ?? "";
}

export async function confirmEvent(
  tokens: { access_token?: string | null; refresh_token?: string | null },
  eventId: string,
): Promise<void> {
  const calendar = getCalendarClient(tokens);

  await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: { status: "confirmed" },
  });
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
