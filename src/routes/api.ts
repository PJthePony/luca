import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, notInArray } from "drizzle-orm";
import { apiAuthMiddleware } from "../middleware/api-auth.js";
import { count as dbCount } from "drizzle-orm";
import { fetchSettingsData, fetchMeetingsData } from "../services/queries.js";
import { meetings } from "../db/schema.js";
import { db } from "../db/index.js";
import {
  users,
  userCalendars,
  availabilityRules,
} from "../db/schema.js";
import { listCalendars } from "../lib/google.js";
import type { GoogleTokens } from "../types/index.js";

type User = typeof users.$inferSelect;

export const apiRoutes = new Hono<{ Variables: { user: User } }>();

apiRoutes.use(
  "*",
  cors({
    origin: [
      "https://luca.tanzillo.ai",
      "https://app.luca.tanzillo.ai",
      "https://family.tanzillo.ai",
      "http://localhost:5181",
      "http://localhost:5180",
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

apiRoutes.use("*", apiAuthMiddleware);

// ── Profile ────────────────────────────────────────────────────────────────

apiRoutes.get("/me", (c) => {
  const u = c.get("user");
  return c.json(serializeUser(u));
});

apiRoutes.patch("/me", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<{ timezone?: string; workEmail?: string | null }>();

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.timezone === "string" && body.timezone.trim()) patch.timezone = body.timezone.trim();
  if ("workEmail" in body) patch.workEmail = body.workEmail?.trim() || null;

  const [updated] = await db.update(users).set(patch).where(eq(users.id, u.id)).returning();
  return c.json(serializeUser(updated));
});

// ── Settings (read) ────────────────────────────────────────────────────────

apiRoutes.get("/settings", async (c) => {
  const user = c.get("user");
  const data = await fetchSettingsData(user.id);
  return c.json({
    user: serializeUser(user),
    calendars: data.calendars,
    meetingTypes: data.types,
    availabilityRules: data.rules,
  });
});

// ── Meetings ───────────────────────────────────────────────────────────────

apiRoutes.get("/meetings", async (c) => {
  const user = c.get("user");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const [{ total }] = await db
    .select({ total: dbCount() })
    .from(meetings)
    .where(eq(meetings.organizerId, user.id));

  const data = await fetchMeetingsData(user.id, limit, offset);

  return c.json({
    total,
    offset,
    limit,
    hasMore: offset + data.length < total,
    items: data.map((d) => ({
      id: d.meeting.id,
      status: d.meeting.status,
      subject: d.thread?.subject ?? null,
      title: d.meeting.title,
      confirmedStart: d.meeting.confirmedStart,
      confirmedEnd: d.meeting.confirmedEnd,
      durationMin: d.meeting.durationMin,
      location: d.meeting.location,
      meetingTypeName: d.meetingType?.name ?? null,
      messageCount: d.messageCount,
      proposedSlotCount: d.slots.length,
      participants: d.participants.map((p) => ({
        id: p.id,
        email: p.email,
        name: p.name,
        role: p.role,
      })),
      createdAt: d.meeting.createdAt,
      updatedAt: d.meeting.updatedAt,
    })),
  });
});

// ── Calendars ──────────────────────────────────────────────────────────────

apiRoutes.post("/settings/calendars/refresh", async (c) => {
  const user = c.get("user");
  if (!user.googleTokens) return c.json({ error: "No Google connection" }, 400);

  const tokens = user.googleTokens as GoogleTokens;
  const calendars = await listCalendars(tokens);

  for (const cal of calendars) {
    await db
      .insert(userCalendars)
      .values({
        userId: user.id,
        calendarId: cal.calendarId,
        summary: cal.summary,
        isPrimary: cal.isPrimary,
        checkForConflicts: true,
      })
      .onConflictDoUpdate({
        target: [userCalendars.userId, userCalendars.calendarId],
        set: { summary: cal.summary, isPrimary: cal.isPrimary },
      });
  }

  const freshIds = calendars.map((c) => c.calendarId);
  await db
    .delete(userCalendars)
    .where(
      freshIds.length > 0
        ? and(eq(userCalendars.userId, user.id), notInArray(userCalendars.calendarId, freshIds))
        : eq(userCalendars.userId, user.id),
    );

  return c.json({ count: calendars.length });
});

apiRoutes.patch("/settings/calendars/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const body = await c.req.json<{ checkForConflicts: boolean }>();

  const cal = await db.query.userCalendars.findFirst({
    where: and(eq(userCalendars.id, id), eq(userCalendars.userId, user.id)),
  });
  if (!cal) return c.json({ error: "Calendar not found" }, 404);

  await db
    .update(userCalendars)
    .set({ checkForConflicts: body.checkForConflicts })
    .where(eq(userCalendars.id, id));

  return c.json({ id, checkForConflicts: body.checkForConflicts });
});

// ── Availability ───────────────────────────────────────────────────────────

apiRoutes.post("/settings/availability", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive?: boolean;
  }>();

  const [created] = await db
    .insert(availabilityRules)
    .values({
      userId: user.id,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      isActive: body.isActive ?? true,
    })
    .returning();

  return c.json(created);
});

apiRoutes.delete("/settings/availability/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const rule = await db.query.availabilityRules.findFirst({
    where: and(eq(availabilityRules.id, id), eq(availabilityRules.userId, user.id)),
  });
  if (!rule) return c.json({ error: "Rule not found" }, 404);

  await db.delete(availabilityRules).where(eq(availabilityRules.id, id));
  return c.json({ id });
});

// ── helpers ────────────────────────────────────────────────────────────────

function serializeUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    timezone: u.timezone,
    workEmail: u.workEmail,
    hasGoogleConnection: !!u.googleTokens,
  };
}
