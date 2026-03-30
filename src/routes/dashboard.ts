import { Hono } from "hono";
import { eq, and, count as dbCount } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  users,
  meetings,
  participants,
  emailThreads,
  emailMessages,
  meetingTypes,
  meetingLocations,
  availabilityRules,
  userCalendars,
  ignoredCalendarEvents,
} from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { cancelMeeting, startRescheduling, proposeTimes } from "../services/meeting-machine.js";
import { sendThreadedReply } from "../services/email.js";
import { findAvailableSlots, previewAvailableSlots } from "../services/slot-proposer.js";
import { notifyUser } from "../services/notification.js";
import { fetchMeetingsData, fetchSettingsData, getAttendeeEmails, isVideoCallType } from "../services/queries.js";
import type { MeetingData, MeetingTypeWithLocations } from "../services/queries.js";
import type { GoogleTokens } from "../types/index.js";
import { env } from "../config.js";
import { createGmailDraft } from "../lib/google.js";
import { formatSlot, buildCalendarDescription } from "../services/intent-handlers.js";
import { nanoid } from "nanoid";
import {
  fontLinks,
  baseStyles,
  settingsStyles,
  dashboardStyles,
  headerStyles,
  logoSvg,
} from "../lib/styles.js";
import { renderSettingsBody } from "./settings.js";

type User = typeof users.$inferSelect;

export const dashboardRoutes = new Hono<{ Variables: { user: User } }>();

dashboardRoutes.use("*", authMiddleware);

// ── Main Dashboard Page ──────────────────────────────────────────────────────

const PAGE_SIZE = 10;

dashboardRoutes.get("/", async (c) => {
  const user = c.get("user");
  const userId = user.id;

  // Count total meetings
  const [{ total }] = await db.select({ total: dbCount() }).from(meetings).where(eq(meetings.organizerId, userId));

  // Fetch first page of meetings + settings data in parallel
  const [meetingsData, settingsData] = await Promise.all([
    fetchMeetingsData(userId, PAGE_SIZE),
    fetchSettingsData(userId),
  ]);

  const hasMore = total > PAGE_SIZE;
  const html = renderDashboardPage(user, meetingsData, hasMore, settingsData.calendars, settingsData.types, settingsData.rules, env.GOOGLE_MAPS_API_KEY);
  return c.html(html);
});

// ── API: Load More Meetings ──────────────────────────────────────────────────

dashboardRoutes.get("/meetings", async (c) => {
  const user = c.get("user");
  const userId = user.id;
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const tz = user.timezone || "America/New_York";

  const [{ total }] = await db.select({ total: dbCount() }).from(meetings).where(eq(meetings.organizerId, userId));
  const meetingsData = await fetchMeetingsData(userId, PAGE_SIZE, offset);

  const cardsHtml = meetingsData.map((d) => renderMeetingCard(d, tz)).join("\n");
  const hasMore = offset + PAGE_SIZE < total;

  return c.json({ html: cardsHtml, hasMore });
});

// ── API: Get Comms for a Meeting ─────────────────────────────────────────────

dashboardRoutes.get("/meetings/:meetingId/comms", async (c) => {
  const { meetingId } = c.req.param();
  const userId = c.get("user").id;

  // Verify ownership
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting || meeting.organizerId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  const thread = await db.query.emailThreads.findFirst({
    where: eq(emailThreads.meetingId, meetingId),
  });

  if (!thread) {
    return c.json({ thread: null, messages: [] });
  }

  const messages = await db.query.emailMessages.findMany({
    where: eq(emailMessages.threadId, thread.id),
    orderBy: (msg, { asc }) => [asc(msg.createdAt)],
  });

  return c.json({
    thread: { id: thread.id, subject: thread.subject },
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmails: m.toEmails,
      ccEmails: m.ccEmails,
      subject: m.subject,
      bodyText: m.bodyText,
      parsedIntent: m.parsedIntent,
      createdAt: m.createdAt,
    })),
  });
});

// ── API: Cancel a Meeting ────────────────────────────────────────────────────

dashboardRoutes.post("/meetings/:meetingId/cancel", async (c) => {
  const { meetingId } = c.req.param();
  const user = c.get("user");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: "" }));
  const reason = body.reason?.trim() || "";

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting || meeting.organizerId !== user.id) {
    return c.json({ error: "Not found" }, 404);
  }

  if (meeting.status === "cancelled") {
    return c.json({ error: "Meeting is already cancelled" }, 400);
  }

  const tokens = user.googleTokens as GoogleTokens;
  if (!tokens) {
    return c.json({ error: "Calendar not connected" }, 400);
  }

  try {
    await cancelMeeting(meetingId, tokens);
  } catch (e: unknown) {
    console.error("cancelMeeting error:", e);
    const message = e instanceof Error ? e.message : "Failed to cancel meeting";
    return c.json({ error: message }, 500);
  }

  // Send cancellation email
  try {
    const thread = await db.query.emailThreads.findFirst({
      where: eq(emailThreads.meetingId, meetingId),
    });

    if (thread) {
      const replyTo = await getAttendeeEmails(meetingId);

      const reasonLine = reason ? `\nReason: ${reason}\n` : "";
      await sendThreadedReply({
        threadId: thread.id,
        to: replyTo,
        bcc: [user.email],
        text: `This meeting has been cancelled.${reasonLine}\n- Luca`,
      });
    }

    await notifyUser({
      type: "meeting_cancelled",
      userId: user.id,
      meetingTitle: meeting.title ?? "Meeting",
      meetingShortId: meeting.shortId,
    });
  } catch (e) {
    console.error("cancel notification error:", e);
  }

  return c.json({ status: "cancelled" });
});

// ── API: Ignore a Meeting (cancel silently, no emails) ───────────────────────

dashboardRoutes.post("/meetings/:meetingId/ignore", async (c) => {
  const { meetingId } = c.req.param();
  const user = c.get("user");

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting || meeting.organizerId !== user.id) {
    return c.json({ error: "Not found" }, 404);
  }

  if (meeting.status === "cancelled") {
    return c.json({ error: "Meeting is already cancelled" }, 400);
  }

  const tokens = user.googleTokens as GoogleTokens;
  if (!tokens) {
    return c.json({ error: "Calendar not connected" }, 400);
  }

  try {
    await cancelMeeting(meetingId, tokens);
  } catch (e: unknown) {
    console.error("ignoreMeeting error:", e);
    const message = e instanceof Error ? e.message : "Failed to ignore meeting";
    return c.json({ error: message }, 500);
  }

  return c.json({ status: "ignored" });
});

// ── API: Nudge a Participant ─────────────────────────────────────────────────

dashboardRoutes.post("/meetings/:meetingId/nudge", async (c) => {
  const { meetingId } = c.req.param();
  const user = c.get("user");

  try {
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
    });
    if (!meeting || meeting.organizerId !== user.id) {
      return c.json({ error: "Not found" }, 404);
    }

    const thread = await db.query.emailThreads.findFirst({
      where: eq(emailThreads.meetingId, meetingId),
    });

    if (!thread) {
      return c.json({ error: "No email thread found" }, 400);
    }

    const allParticipants = await db.query.participants.findMany({
      where: eq(participants.meetingId, meetingId),
    });
    const pendingParticipants = allParticipants
      .filter((p) => p.role !== "organizer" && p.rsvpStatus === "pending")
      .map((p) => p.email);

    if (pendingParticipants.length === 0) {
      return c.json({ error: "No pending participants to nudge" }, 400);
    }

    await sendThreadedReply({
      threadId: thread.id,
      to: pendingParticipants,
      bcc: [user.email],
      text: `Just checking in — have you had a chance to pick a time? You can select one here: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
    });

    return c.json({ status: "nudged", count: pendingParticipants.length });
  } catch (e: unknown) {
    console.error("nudge error:", e);
    const message = e instanceof Error ? e.message : "Failed to send nudge";
    return c.json({ error: message }, 500);
  }
});

// ── API: Reschedule a Meeting ────────────────────────────────────────────────

dashboardRoutes.post("/meetings/:meetingId/reschedule", async (c) => {
  const { meetingId } = c.req.param();
  const user = c.get("user");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: "" }));
  const reason = body.reason?.trim() || "";

  try {
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
    });
    if (!meeting || meeting.organizerId !== user.id) {
      return c.json({ error: "Not found" }, 404);
    }

    const tokens = user.googleTokens as GoogleTokens;
    if (!tokens) {
      return c.json({ error: "Calendar not connected" }, 400);
    }

    // Start rescheduling (releases existing holds)
    await startRescheduling(meetingId, tokens);

    // Find new available slots
    const newSlots = await findAvailableSlots(
      user.id,
      meetingId,
      meeting.durationMin,
      [],
      14,
      meeting.meetingTypeId,
    );

    if (newSlots.length > 0) {
      await proposeTimes(
        meetingId,
        newSlots.map((s) => ({ start: s.start, end: s.end })),
        tokens,
        meeting.title ?? "Meeting",
      );

      // Send email with new times
      const thread = await db.query.emailThreads.findFirst({
        where: eq(emailThreads.meetingId, meetingId),
      });

      if (thread) {
        const replyTo = await getAttendeeEmails(meetingId);

        const tz = user.timezone || "America/New_York";
        const timeOptions = newSlots
          .map(
            (s, i) =>
              `${i + 1}. ${s.start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz })} at ${s.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}`,
          )
          .join("\n");

        const reasonLine = reason ? `\nReason: ${reason}\n` : "";
        await sendThreadedReply({
          threadId: thread.id,
          to: replyTo,
          bcc: [user.email],
          text: `We need to reschedule.${reasonLine}\n\nHere are some new options:\n\n${timeOptions}\n\nPick one here: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
        });
      }
    }

    await notifyUser({
      type: "meeting_rescheduled",
      userId: user.id,
      meetingTitle: meeting.title ?? "Meeting",
      meetingShortId: meeting.shortId,
    });

    return c.json({ status: "rescheduling", newSlots: newSlots.length });
  } catch (e: unknown) {
    console.error("reschedule error:", e);
    const message = e instanceof Error ? e.message : "Failed to reschedule meeting";
    return c.json({ error: message }, 500);
  }
});

// ── API: Update Agenda ───────────────────────────────────────────────────────

dashboardRoutes.post("/meetings/:meetingId/agenda", async (c) => {
  const { meetingId } = c.req.param();
  const user = c.get("user");
  const body = await c.req.json<{ action: "add" | "remove"; item?: string; index?: number }>();

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting || meeting.organizerId !== user.id) {
    return c.json({ error: "Not found" }, 404);
  }

  const agenda = [...((meeting.agenda as string[]) ?? [])];

  if (body.action === "add" && body.item) {
    agenda.push(body.item);
  } else if (body.action === "remove" && typeof body.index === "number") {
    agenda.splice(body.index, 1);
  }

  await db
    .update(meetings)
    .set({ agenda, updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));

  return c.json({ status: "ok", agenda });
});

// ── API: Preview Available Slots ─────────────────────────────────────────────

dashboardRoutes.get("/preview-slots", async (c) => {
  const user = c.get("user");
  const meetingTypeId = c.req.query("meetingTypeId") || null;
  const tz = user.timezone || "America/New_York";

  // Look up meeting type for duration
  let durationMin = 30;
  if (meetingTypeId) {
    const mType = await db.query.meetingTypes.findFirst({
      where: eq(meetingTypes.id, meetingTypeId),
    });
    if (mType) durationMin = mType.defaultDuration;
  }

  try {
    const { slots, blockingEvents } = await previewAvailableSlots(
      user.id,
      durationMin,
      meetingTypeId,
    );

    const slotsHtml = slots.length > 0
      ? slots.map((s) => {
          const day = s.start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
          const startTime = s.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
          const endTime = s.end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
          return `<div class="preview-slot"><span class="preview-slot-day">${day}</span><span class="preview-slot-time">${startTime} - ${endTime}</span></div>`;
        }).join("\n")
      : `<div class="preview-empty">No available windows found in the next 10 days.</div>`;

    const eventsHtml = blockingEvents.map((e) => {
      const day = e.start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
      const startTime = e.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
      const endTime = e.end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
      const ignoredClass = e.isIgnored ? "ignored" : "";
      const btnLabel = e.isIgnored ? "Restore" : "Ignore";
      const btnAction = e.isIgnored ? "unignoreEvent" : "ignoreEvent";
      return `<div class="blocking-event ${ignoredClass}">
        <div class="blocking-event-info">
          <span class="blocking-event-name">${e.summary}</span>
          <span class="blocking-event-time">${day}, ${startTime} - ${endTime}</span>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="${btnAction}('${e.calendarId}', '${e.eventId}', '${e.summary.replace(/'/g, "\\'")}', this)">${btnLabel}</button>
      </div>`;
    }).join("\n");

    return c.json({ slotsHtml, eventsHtml, slotCount: slots.length });
  } catch (e: unknown) {
    console.error("preview-slots error:", e);
    const message = e instanceof Error ? e.message : "Failed to preview slots";
    return c.json({ error: message }, 500);
  }
});

// ── API: Weekly Calendar Events ──────────────────────────────────────────────

dashboardRoutes.get("/calendar-events", async (c) => {
  const user = c.get("user");
  const tz = user.timezone || "America/New_York";
  const weekStartParam = c.req.query("weekStart");

  const tokens = user.googleTokens as GoogleTokens;
  if (!tokens) {
    return c.json({ error: "Calendar not connected" }, 400);
  }

  // Parse week start (Monday), default to this week's Monday
  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam + "T00:00:00Z");
  } else {
    const now = new Date();
    const localParts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
    const y = parseInt(localParts.find(p => p.type === "year")!.value);
    const m = parseInt(localParts.find(p => p.type === "month")!.value) - 1;
    const d = parseInt(localParts.find(p => p.type === "day")!.value);
    const wd = localParts.find(p => p.type === "weekday")!.value;
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[wd] ?? 0;
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart = new Date(Date.UTC(y, m, d + mondayOffset));
  }

  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Get calendars
  const orgCalendars = await db.query.userCalendars.findMany({
    where: eq(userCalendars.userId, user.id),
  });
  const calendarIds = orgCalendars.length > 0
    ? orgCalendars.filter((cal) => cal.checkForConflicts).map((cal) => cal.calendarId)
    : [user.email];

  // Fetch events
  const allEvents: { calendarId: string; eventId: string; summary: string; start: Date; end: Date }[] = [];
  for (const calId of calendarIds) {
    const events = await (await import("../lib/google.js")).listEvents(tokens, calId, weekStart, weekEnd);
    allEvents.push(...events);
  }

  // Get ignored status
  const ignoredRecords = await db.query.ignoredCalendarEvents.findMany({
    where: eq(ignoredCalendarEvents.userId, user.id),
  });
  const ignoredKeys = new Set(ignoredRecords.map((e) => `${e.calendarId}:${e.googleEventId}`));

  // Group by day of week (0=Mon in our grid)
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayColumns: string[] = [];

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const dateLabel = dayDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

    // Find events for this day
    const dayEvents = allEvents.filter((e) => {
      const eventDay = e.start.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
      const dayDateStr = dayDate.toISOString().slice(0, 10);
      const eventDateStr = e.start.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
      // Also include all-day events that span this date
      if (eventDateStr === dayDateStr) return true;
      // All-day events: check if day falls within range
      if (e.start <= dayDate && e.end > dayDate) return true;
      return false;
    }).sort((a, b) => a.start.getTime() - b.start.getTime());

    const eventsHtml = dayEvents.map((e) => {
      const isIgnored = ignoredKeys.has(`${e.calendarId}:${e.eventId}`);
      const startTime = e.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
      const endTime = e.end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
      // Check if all-day event (spans 24h+ starting at midnight)
      const durationMs = e.end.getTime() - e.start.getTime();
      const isAllDay = durationMs >= 23 * 60 * 60 * 1000;
      const timeLabel = isAllDay ? "All day" : `${startTime} – ${endTime}`;
      const ignoredClass = isIgnored ? " ignored" : "";

      return `<div class="week-event${ignoredClass}" onclick="toggleCalEvent('${e.calendarId}', '${e.eventId}', '${e.summary.replace(/'/g, "\\'")}', ${isIgnored}, this)">
        <div class="week-event-name">${e.summary}</div>
        <div class="week-event-time">${timeLabel}</div>
      </div>`;
    }).join("");

    const emptyClass = dayEvents.length === 0 ? " week-day-empty" : "";
    dayColumns.push(`<div class="week-day-col${emptyClass}">
      <div class="week-day-header"><span class="week-day-name">${days[i]}</span><span class="week-day-date">${dateLabel}</span></div>
      <div class="week-day-events">${eventsHtml || '<div class="week-event-none">No events</div>'}</div>
    </div>`);
  }

  const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    + " – "
    + new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return c.json({
    html: dayColumns.join(""),
    weekLabel,
    weekStart: weekStart.toISOString().slice(0, 10),
  });
});

// ── API: Ignore a Calendar Event ─────────────────────────────────────────────

dashboardRoutes.post("/events/ignore", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ calendarId: string; googleEventId: string; summary?: string }>();

  await db
    .insert(ignoredCalendarEvents)
    .values({
      userId: user.id,
      calendarId: body.calendarId,
      googleEventId: body.googleEventId,
      summary: body.summary || null,
    })
    .onConflictDoNothing();

  return c.json({ status: "ignored" });
});

// ── API: Unignore a Calendar Event ───────────────────────────────────────────

dashboardRoutes.post("/events/unignore", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ calendarId: string; googleEventId: string }>();

  await db
    .delete(ignoredCalendarEvents)
    .where(
      and(
        eq(ignoredCalendarEvents.userId, user.id),
        eq(ignoredCalendarEvents.calendarId, body.calendarId),
        eq(ignoredCalendarEvents.googleEventId, body.googleEventId),
      ),
    );

  return c.json({ status: "unignored" });
});

// ── API: Create a New Meeting ────────────────────────────────────────────────

dashboardRoutes.post("/meetings/create", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    participantEmails: string[];
    meetingTypeId?: string;
    title?: string;
    notes?: string;
  }>();

  const tokens = user.googleTokens as GoogleTokens;
  if (!tokens) {
    return c.json({ error: "Calendar not connected" }, 400);
  }

  const tz = user.timezone || "America/New_York";

  // Resolve meeting type
  let effectiveDuration = 30;
  let resolvedType: typeof meetingTypes.$inferSelect | undefined;
  if (body.meetingTypeId) {
    const mType = await db.query.meetingTypes.findFirst({
      where: and(
        eq(meetingTypes.id, body.meetingTypeId),
        eq(meetingTypes.userId, user.id),
      ),
    });
    if (mType) {
      resolvedType = mType;
      effectiveDuration = mType.defaultDuration;
    }
  }

  // Build title
  const participantNames = body.participantEmails.map((e) => e.split("@")[0]);
  const allNames = [user.name.split(/\s+/)[0], ...participantNames];
  const nameList = allNames.length <= 2
    ? allNames.join(" and ")
    : allNames.slice(0, -1).join(", ") + " and " + allNames[allNames.length - 1];
  const meetingTitle = body.title
    || (resolvedType ? `${resolvedType.name} for ${nameList}` : `Meeting for ${nameList}`);

  // Create meeting record
  const shortId = nanoid(8);
  const [meeting] = await db
    .insert(meetings)
    .values({
      shortId,
      organizerId: user.id,
      title: meetingTitle,
      status: "draft",
      durationMin: effectiveDuration,
      meetingTypeId: body.meetingTypeId || null,
      notes: body.notes || null,
      location: resolvedType?.defaultLocation || null,
    })
    .returning();

  // Add participants
  for (const email of body.participantEmails) {
    await db.insert(participants).values({
      meetingId: meeting.id,
      email: email.trim(),
      role: "attendee",
    });
  }
  // Add organizer as participant
  await db.insert(participants).values({
    meetingId: meeting.id,
    email: user.email,
    role: "organizer",
  });

  // Find available slots
  const slots = await findAvailableSlots(
    user.id,
    meeting.id,
    effectiveDuration,
    [],
    10,
    body.meetingTypeId,
  );

  if (slots.length === 0) {
    return c.json({ error: "No available times found in the next 10 days" }, 400);
  }

  // Create tentative calendar holds
  const isVideoCall = resolvedType?.addGoogleMeet ?? false;
  const calendarDescription = buildCalendarDescription(body.notes || null, []);

  const proposeResult = await proposeTimes(
    meeting.id,
    slots.map((s) => ({ start: s.start, end: s.end })),
    tokens,
    meetingTitle,
    calendarDescription,
    {
      addGoogleMeet: isVideoCall,
      location: resolvedType?.defaultLocation ?? undefined,
      timeZone: tz,
    },
  );

  // Compose email body
  const timeList = proposeResult.slots
    .map((s, i) => `${i + 1}. ${formatSlot(s.startTime, s.endTime, tz)}`)
    .join("\n");

  let meetNote = "";
  if (isVideoCall && proposeResult.meetLink) {
    meetNote = "\n\nA Google Meet link will be included in the calendar invite.";
  }

  const emailBody = `Hi,\n\nI'd like to schedule ${meetingTitle.toLowerCase().startsWith("meeting") ? "a" : ""} ${meetingTitle}. Here are some times that work:\n\n${timeList}\n\nJust reply with your preferred option, or let me know if none of these work and I'll find more times.${meetNote}\n\nYou can also pick a time here: ${env.APP_URL}/meeting/${shortId}\n\n- Luca`;

  const emailSubject = meetingTitle;

  // Save as Gmail draft
  try {
    await createGmailDraft(
      tokens,
      body.participantEmails,
      emailSubject,
      emailBody,
    );
  } catch (e: unknown) {
    console.error("Gmail draft error:", e);
    // Meeting is still created even if draft fails
  }

  return c.json({
    status: "created",
    meetingId: meeting.id,
    shortId,
    title: meetingTitle,
    slotCount: proposeResult.slots.length,
  });
});

// ── HTML Rendering ───────────────────────────────────────────────────────────

function renderDashboardPage(
  user: typeof users.$inferSelect,
  meetingsData: MeetingData[],
  hasMore: boolean,
  calendars: (typeof userCalendars.$inferSelect)[],
  types: MeetingTypeWithLocations[],
  rules: (typeof availabilityRules.$inferSelect)[],
  googleMapsApiKey?: string,
): string {
  const tz = user.timezone || "America/New_York";

  const settingsBody = renderSettingsBody(user, calendars, types, rules, googleMapsApiKey);

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });

  const meetingCards = meetingsData
    .map((d) => renderMeetingCard(d, tz))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Luca</title>
  ${fontLinks}
  ${googleMapsApiKey ? `<script async src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&loading=async"></script>` : ""}
  <style>
    ${baseStyles}
    ${settingsStyles}
    ${dashboardStyles}
    ${headerStyles}
  </style>
</head>
<body>
  <header class="app-header">
    <a href="/" class="app-header-brand">
      ${logoSvg}
      <span class="app-name">Luca</span>
    </a>
    <div class="app-header-nav">
      <button class="header-btn" onclick="openSettingsModal()" aria-label="Settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>
      <button class="header-btn" onclick="window.location.href='/auth/logout'" aria-label="Sign out">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  </header>

  <div class="container">
    <div class="page-header">
      <div>
        <div class="page-date">${dateStr}</div>
        <h1>On the Books</h1>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="openNewMeetingModal()">+ New Meeting</button>
        <select class="filter-select" onchange="filterMeetings(this.value)">
          <option value="upcoming">Upcoming</option>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
    </div>

    <div id="meetingsList">
      ${meetingCards || `<div class="empty-state"><p>No meetings yet.</p><p class="text-sm">CC luca@tanzillo.ai on an email to get started.</p></div>`}
    </div>
    <div id="emptyFilter" class="empty-state" style="display:none;">
      <p>No upcoming meetings.</p>
      <p class="text-sm">CC <strong>luca@tanzillo.ai</strong> on any email to schedule one.</p>
    </div>
    ${hasMore ? `<div id="loadMoreWrap" style="text-align:center;padding:1.5rem 0;"><button class="btn btn-secondary" id="loadMoreBtn" onclick="loadMore()">Load more</button></div>` : ""}
  </div>

  <!-- Settings Modal -->
  <div class="modal modal-wide" id="settingsModal">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">Settings</div>
        <button class="modal-close" onclick="closeModal('settingsModal')">&times;</button>
      </div>
      <div class="modal-body">
        ${settingsBody}
      </div>
    </div>
  </div>

  <!-- Comms Modal -->
  <div class="modal comms-modal" id="commsModal">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title" id="commsModalTitle">Communications</div>
        <button class="modal-close" onclick="closeModal('commsModal')">&times;</button>
      </div>
      <div class="comms-body" id="commsBody">
        <div class="comms-loading">Loading...</div>
      </div>
      <div class="comms-footer" id="commsFooter"></div>
    </div>
  </div>

  <!-- Agenda Modal -->
  <div class="modal" id="agendaModal">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title" id="agendaModalTitle">Agenda</div>
        <button class="modal-close" onclick="closeModal('agendaModal')">&times;</button>
      </div>
      <div class="modal-body" id="agendaModalBody"></div>
    </div>
  </div>

  <!-- New Meeting Modal -->
  <div class="modal modal-wide" id="newMeetingModal">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">New Meeting</div>
        <button class="modal-close" onclick="closeModal('newMeetingModal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="newMeetingForm" onsubmit="return createMeeting(event)">
          <div class="form-group">
            <label class="form-label">Participant email(s)</label>
            <input type="text" name="participantEmails" class="form-input" placeholder="jane@example.com, bob@example.com" required>
            <div class="form-hint">Comma-separated for multiple participants</div>
          </div>
          <div class="form-group">
            <label class="form-label">Meeting type</label>
            <select name="meetingTypeId" class="form-input" onchange="onMeetingTypeChange(this.value)">
              <option value="">-- Select type --</option>
              ${types.map((t) => `<option value="${t.id}">${t.name} (${t.defaultDuration}min)</option>`).join("\n")}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Title <span class="form-hint-inline">(optional, auto-generated if blank)</span></label>
            <input type="text" name="title" class="form-input" placeholder="Coffee with Jane">
          </div>
          <div class="form-group">
            <label class="form-label">Notes <span class="form-hint-inline">(optional)</span></label>
            <textarea name="notes" class="form-input form-textarea" rows="2" placeholder="Context for the meeting..."></textarea>
          </div>

          <div id="newMeetingPreview" class="preview-panel" style="display:none;">
            <div class="preview-section">
              <h4 class="preview-section-title">Available Windows</h4>
              <div id="newMeetingSlots" class="preview-slots-list"></div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeModal('newMeetingModal')">Cancel</button>
            <button type="submit" class="btn btn-primary" id="createMeetingBtn">Create Draft</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <div id="toast"></div>

  <footer style="padding:24px 32px;text-align:center;font-size:0.7rem;color:var(--nxb-color-text-muted, #94a3b8);border-top:1px solid var(--nxb-color-border, rgba(255,255,255,0.06));">
    <a href="https://tanzillo.ai/privacy.html" target="_blank" style="color:inherit;text-decoration:none;margin-right:16px;">Privacy</a>
    <a href="https://tanzillo.ai/terms.html" target="_blank" style="color:inherit;text-decoration:none;">Terms</a>
  </footer>

  <script>
    // ── Utilities ──────────────────────

    function toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) closeModal(m.id);
      });
    });

    // ── Load More ─────────────────────

    let meetingsOffset = ${meetingsData.length};

    async function loadMore() {
      const btn = document.getElementById('loadMoreBtn');
      btn.textContent = 'Loading...';
      btn.disabled = true;
      try {
        const res = await fetch('/dashboard/meetings?offset=' + meetingsOffset);
        const data = await res.json();
        if (data.html) {
          document.getElementById('meetingsList').insertAdjacentHTML('beforeend', data.html);
          meetingsOffset += ${PAGE_SIZE};
          // Re-apply current filter to newly loaded cards
          const currentFilter = document.querySelector('.filter-select').value;
          filterMeetings(currentFilter);
        }
        if (!data.hasMore) {
          document.getElementById('loadMoreWrap').remove();
        } else {
          btn.textContent = 'Load more';
          btn.disabled = false;
        }
      } catch (e) {
        btn.textContent = 'Load more';
        btn.disabled = false;
        toast('Failed to load more meetings');
      }
    }

    // ── Filter ────────────────────────

    function filterMeetings(value) {
      const cards = document.querySelectorAll('.meeting-card');
      let visibleCount = 0;
      cards.forEach(card => {
        const status = card.dataset.status;
        const upcoming = card.dataset.upcoming === 'true';
        let show = false;
        if (value === 'all') {
          show = true;
        } else if (value === 'upcoming') {
          show = upcoming;
        } else if (value === 'active') {
          show = ['draft', 'proposed', 'rescheduling'].includes(status);
        } else if (value === 'confirmed') {
          show = (status === 'confirmed' || status === 'completed');
        } else if (value === 'cancelled') {
          show = status === 'cancelled';
        }
        card.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });
      const emptyEl = document.getElementById('emptyFilter');
      if (emptyEl) emptyEl.style.display = (cards.length > 0 && visibleCount === 0) ? '' : 'none';
    }

    // Apply default filter on page load
    filterMeetings('upcoming');

    // ── Settings Modal ────────────────

    function openSettingsModal() {
      document.getElementById('settingsModal').classList.add('active');
    }

    // ── Comms Modal ───────────────────

    async function openCommsModal(meetingId, meetingTitle) {
      document.getElementById('commsModalTitle').textContent = 'Comms — ' + meetingTitle;
      document.getElementById('commsBody').innerHTML = '<div class="comms-loading">Loading...</div>';
      document.getElementById('commsFooter').textContent = '';
      document.getElementById('commsModal').classList.add('active');

      try {
        const res = await fetch('/dashboard/meetings/' + meetingId + '/comms');
        const data = await res.json();

        if (!data.thread || data.messages.length === 0) {
          document.getElementById('commsBody').innerHTML = '<div class="comms-loading">No communications yet.</div>';
          return;
        }

        const lucaEmail = 'luca@tanzillo.ai';
        let html = '';
        data.messages.forEach(msg => {
          const isLuca = msg.fromEmail === lucaEmail || msg.fromEmail.startsWith('luca@');
          const dirClass = msg.direction === 'inbound' ? 'inbound' : (isLuca ? 'luca' : 'outbound');
          const dirLabel = msg.direction === 'inbound' ? 'INBOUND' : (isLuca ? 'OUTBOUND (Luca)' : 'OUTBOUND');

          const intentHtml = msg.direction === 'inbound' && msg.parsedIntent?.intent
            ? '<span class="intent-badge">' + msg.parsedIntent.intent + '</span>'
            : '';

          const date = new Date(msg.createdAt);
          const timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            + ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

          html += '<div class="email-msg">';
          html += '<div class="email-msg-header">';
          html += '<span class="email-direction ' + dirClass + '">' + dirLabel + '</span>';
          html += '<div style="display:flex;gap:6px;align-items:center">' + intentHtml + '<span style="font-size:0.75rem;color:var(--nxb-color-text-muted)">' + timeStr + '</span></div>';
          html += '</div>';
          html += '<div class="email-meta">';
          html += '<div>FROM: ' + msg.fromEmail + '</div>';
          if (msg.toEmails?.length) html += '<div>TO: ' + msg.toEmails.join(', ') + '</div>';
          if (msg.ccEmails?.length) html += '<div>CC: ' + msg.ccEmails.join(', ') + '</div>';
          html += '</div>';
          html += '<div class="email-body">' + escapeHtml(msg.bodyText || '(no content)') + '</div>';
          html += '</div>';
        });

        document.getElementById('commsBody').innerHTML = html;
        document.getElementById('commsFooter').textContent = data.messages.length + ' messages  ·  Thread: ' + (data.thread.subject || '(no subject)');

      } catch (e) {
        document.getElementById('commsBody').innerHTML = '<div class="comms-loading">Failed to load communications.</div>';
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ── Actions ───────────────────────

    async function cancelMeeting(meetingId) {
      const reason = prompt('Why are you cancelling? (This will be included in the notification to participants)');
      if (reason === null) return;
      try {
        const res = await fetch('/dashboard/meetings/' + meetingId + '/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason || '' }),
        });
        if (res.ok) {
          toast('Meeting cancelled');
          setTimeout(() => location.reload(), 800);
        } else {
          const data = await res.json();
          toast('Error: ' + (data.error || 'Failed'));
        }
      } catch (e) {
        toast('Network error');
      }
    }

    async function nudgeMeeting(meetingId) {
      try {
        const res = await fetch('/dashboard/meetings/' + meetingId + '/nudge', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          toast('Nudge sent to ' + data.count + ' participant(s)');
        } else {
          toast('Error: ' + (data.error || 'Failed'));
        }
      } catch (e) {
        toast('Network error');
      }
    }

    async function ignoreMeeting(meetingId) {
      if (!confirm('Ignore this meeting? It will be cancelled without notifying anyone.')) return;
      try {
        const res = await fetch('/dashboard/meetings/' + meetingId + '/ignore', { method: 'POST' });
        if (res.ok) {
          toast('Meeting ignored');
          setTimeout(() => location.reload(), 800);
        } else {
          const data = await res.json();
          toast('Error: ' + (data.error || 'Failed'));
        }
      } catch (e) {
        toast('Network error');
      }
    }

    async function rescheduleMeeting(meetingId) {
      const reason = prompt('Why are you rescheduling? (This will be included in the message to participants)');
      if (reason === null) return;
      try {
        const res = await fetch('/dashboard/meetings/' + meetingId + '/reschedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason || '' }),
        });
        const data = await res.json();
        if (res.ok) {
          toast('Rescheduling — ' + data.newSlots + ' new time(s) proposed');
          setTimeout(() => location.reload(), 800);
        } else {
          toast('Error: ' + (data.error || 'Failed'));
        }
      } catch (e) {
        toast('Network error');
      }
    }

    // ── Agenda Modal ──────────────────

    let currentAgendaMeetingId = null;

    function openAgendaModal(meetingId, meetingTitle, agendaJson) {
      currentAgendaMeetingId = meetingId;
      document.getElementById('agendaModalTitle').textContent = 'Agenda — ' + meetingTitle;
      const agenda = JSON.parse(agendaJson);
      renderAgendaModalBody(agenda);
      document.getElementById('agendaModal').classList.add('active');
    }

    function renderAgendaModalBody(agenda) {
      let html = '';
      agenda.forEach((item, i) => {
        html += '<div class="agenda-modal-item">';
        html += '<span>' + escapeHtml(item) + '</span>';
        html += '<button class="agenda-remove-btn" onclick="removeAgendaItem(' + i + ')">&times;</button>';
        html += '</div>';
      });
      html += '<div class="agenda-add-row">';
      html += '<input type="text" id="agendaNewItem" placeholder="New agenda item..." onkeydown="if(event.key===\\\'Enter\\\')addAgendaItem()">';
      html += '<button class="btn btn-primary btn-sm" onclick="addAgendaItem()">Add</button>';
      html += '</div>';
      document.getElementById('agendaModalBody').innerHTML = html;
    }

    async function addAgendaItem() {
      const input = document.getElementById('agendaNewItem');
      const item = input.value.trim();
      if (!item) return;

      try {
        const res = await fetch('/dashboard/meetings/' + currentAgendaMeetingId + '/agenda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', item }),
        });
        const data = await res.json();
        if (res.ok) {
          renderAgendaModalBody(data.agenda);
          updateAgendaDisplay(currentAgendaMeetingId, data.agenda);
        }
      } catch (e) { toast('Error adding item'); }
    }

    async function removeAgendaItem(index) {
      try {
        const res = await fetch('/dashboard/meetings/' + currentAgendaMeetingId + '/agenda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove', index }),
        });
        const data = await res.json();
        if (res.ok) {
          renderAgendaModalBody(data.agenda);
          updateAgendaDisplay(currentAgendaMeetingId, data.agenda);
        }
      } catch (e) { toast('Error removing item'); }
    }

    function updateAgendaDisplay(meetingId, agenda) {
      const el = document.getElementById('agenda-' + meetingId);
      if (!el) return;
      if (agenda.length === 0) {
        el.innerHTML = '<span class="agenda-none">No agenda items</span>';
      } else {
        el.innerHTML = agenda.map(a => '<div class="agenda-item">' + escapeHtml(a) + '</div>').join('');
      }
    }

    // ── New Meeting Modal ──────────────

    function openNewMeetingModal() {
      document.getElementById('newMeetingForm').reset();
      document.getElementById('newMeetingPreview').style.display = 'none';
      document.getElementById('newMeetingModal').classList.add('active');
    }

    async function onMeetingTypeChange(meetingTypeId) {
      const preview = document.getElementById('newMeetingPreview');
      const slotsEl = document.getElementById('newMeetingSlots');

      if (!meetingTypeId) {
        preview.style.display = 'none';
        return;
      }

      slotsEl.innerHTML = '<div class="preview-loading">Loading availability...</div>';
      preview.style.display = '';

      try {
        const res = await fetch('/dashboard/preview-slots?meetingTypeId=' + meetingTypeId);
        const data = await res.json();
        if (data.error) {
          slotsEl.innerHTML = '<div class="preview-empty">' + escapeHtml(data.error) + '</div>';
          return;
        }
        slotsEl.innerHTML = data.slotsHtml;
      } catch (e) {
        slotsEl.innerHTML = '<div class="preview-empty">Failed to load availability.</div>';
      }
    }

    async function createMeeting(e) {
      e.preventDefault();
      const form = document.getElementById('newMeetingForm');
      const btn = document.getElementById('createMeetingBtn');
      btn.disabled = true;
      btn.textContent = 'Creating...';

      const emailsRaw = form.participantEmails.value;
      const participantEmails = emailsRaw.split(',').map(e => e.trim()).filter(Boolean);

      if (participantEmails.length === 0) {
        toast('Please enter at least one email');
        btn.disabled = false;
        btn.textContent = 'Create Draft';
        return false;
      }

      try {
        const res = await fetch('/dashboard/meetings/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantEmails,
            meetingTypeId: form.meetingTypeId.value || undefined,
            title: form.title.value || undefined,
            notes: form.notes.value || undefined,
          }),
        });
        const data = await res.json();

        if (data.error) {
          toast(data.error);
          btn.disabled = false;
          btn.textContent = 'Create Draft';
          return false;
        }

        closeModal('newMeetingModal');
        toast('Meeting created — check your Gmail drafts');
        // Reload to show new meeting card
        setTimeout(() => window.location.reload(), 500);
      } catch (e) {
        toast('Failed to create meeting');
        btn.disabled = false;
        btn.textContent = 'Create Draft';
      }
      return false;
    }

  </script>
</body>
</html>`;
}

function renderMeetingCard(d: MeetingData, tz: string): string {
  const m = d.meeting;
  const isCancelled = m.status === "cancelled";
  const now = new Date();
  const isCompleted = m.status === "confirmed" && m.confirmedEnd != null && m.confirmedEnd < now;
  const displayStatus = isCompleted ? "completed" : m.status;
  const isUpcoming = !isCancelled && !isCompleted;
  const attendees = d.participants.filter((p) => p.role !== "organizer");
  const attendeeStr = attendees.map((p) => p.name || p.email).join(", ");
  const rsvpStr = attendees.length > 0
    ? attendees.map((p) => `<span class="rsvp ${p.rsvpStatus}">${p.rsvpStatus}</span>`).join(" ")
    : "";

  // Cancelled meetings get a compact card
  if (isCancelled) {
    const dateStr = m.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
    return `
    <div class="meeting-card cancelled" data-status="cancelled" data-upcoming="false">
      <div class="meeting-card-header">
        <div style="white-space:nowrap;">
          <span class="status-badge cancelled">Cancelled</span>
          <span style="margin-left:0.5rem;font-weight:500;">${m.title ?? "Meeting"}</span>
          <span class="text-sm text-muted" style="margin-left:0.5rem;">${attendeeStr} · ${dateStr}</span>
        </div>
        <button class="action-btn comms" onclick="openCommsModal('${m.id}', '${(m.title ?? "Meeting").replace(/'/g, "\\'")}')">View Comms</button>
      </div>
    </div>`;
  }

  // Times section
  let timesHtml = "";
  if (m.status === "confirmed" && m.confirmedStart) {
    const dateStr = m.confirmedStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
    const timeStr = m.confirmedStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
    timesHtml = `<div class="meeting-times"><strong>Confirmed: ${dateStr} at ${timeStr}</strong></div>`;
  } else if (["proposed", "rescheduling"].includes(m.status) && d.slots.length > 0) {
    const slotsHtml = d.slots
      .map((s) => {
        const dateStr = s.startTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
        const timeStr = s.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
        return `<span class="time-slot">${dateStr}, ${timeStr}</span>`;
      })
      .join(" ");
    timesHtml = `<div class="meeting-times">Proposed times: ${slotsHtml}</div>`;
  }

  // Agenda section
  const agenda = (m.agenda as string[]) ?? [];
  const agendaJson = JSON.stringify(agenda).replace(/'/g, "\\'").replace(/"/g, "&quot;");
  const agendaHtml = agenda.length > 0
    ? agenda.map((a) => `<div class="agenda-item">${escapeHtml(a)}</div>`).join("")
    : '<span class="agenda-none">No agenda items</span>';

  // Meeting type and meta
  const metaParts: string[] = [];
  if (attendeeStr) metaParts.push(attendeeStr);
  if (attendees.length > 0) metaParts.push(`RSVP: ${rsvpStr}`);
  if (m.durationMin) metaParts.push(`${m.durationMin} min`);
  if (d.meetingType) metaParts.push(d.meetingType.name);
  if (m.location) metaParts.push(m.location);

  // Actions
  const actions: string[] = [];
  if (!isCompleted) {
    if (["proposed", "rescheduling"].includes(m.status)) {
      actions.push(`<button class="action-btn nudge" onclick="nudgeMeeting('${m.id}')">Nudge</button>`);
    }
    if (["proposed", "confirmed"].includes(m.status)) {
      actions.push(`<button class="action-btn reschedule" onclick="rescheduleMeeting('${m.id}')">Reschedule</button>`);
    }
    actions.push(`<button class="action-btn cancel" onclick="cancelMeeting('${m.id}')">Cancel</button>`);
    actions.push(`<button class="action-btn ignore" onclick="ignoreMeeting('${m.id}')">Ignore</button>`);
  }
  actions.push(`<button class="action-btn comms" onclick="openCommsModal('${m.id}', '${(m.title ?? "Meeting").replace(/'/g, "\\'")}')">View Comms${d.messageCount > 0 ? ` (${d.messageCount})` : ""}</button>`);

  return `
  <div class="meeting-card" data-status="${displayStatus}" data-upcoming="${isUpcoming}">
    <div class="meeting-card-header">
      <div class="meeting-title">${m.title ?? "Meeting"}</div>
      <span class="status-badge ${displayStatus}">${displayStatus}</span>
    </div>
    <div class="meeting-meta">${metaParts.join("  ·  ")}</div>
    ${timesHtml}
    <div class="meeting-agenda">
      <div class="agenda-label">Agenda</div>
      <div id="agenda-${m.id}">${agendaHtml}</div>
      <button class="add-agenda-btn" onclick="openAgendaModal('${m.id}', '${(m.title ?? "Meeting").replace(/'/g, "\\'")}', '${agendaJson}')">+ Add item</button>
    </div>
    <div class="meeting-actions">
      ${actions.join("\n      ")}
    </div>
  </div>`;
}

/** Server-side HTML escaping for agenda items, etc. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
