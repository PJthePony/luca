import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  users,
  userCalendars,
  meetingTypes,
  meetingLocations,
  availabilityRules,
} from "../db/schema.js";
import { listCalendars } from "../lib/google.js";
import { env } from "../config.js";

export const settingsRoutes = new Hono();

// ── Main Settings Page ──────────────────────────────────────────────────────

settingsRoutes.get("/:userId", async (c) => {
  const { userId } = c.req.param();

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return c.html("<h1>User not found</h1>", 404);
  }

  // Set cookie so root "/" can redirect back here
  c.header("Set-Cookie", `luca_user=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`);

  const calendars = await db.query.userCalendars.findMany({
    where: eq(userCalendars.userId, userId),
  });

  const types = await db.query.meetingTypes.findMany({
    where: eq(meetingTypes.userId, userId),
  });

  // Get locations for each in-person type
  const typesWithLocations = await Promise.all(
    types.map(async (t) => {
      const locations = t.isOnline
        ? []
        : await db.query.meetingLocations.findMany({
            where: eq(meetingLocations.meetingTypeId, t.id),
            orderBy: (loc, { asc }) => [asc(loc.sortOrder)],
          });
      return { ...t, locations };
    }),
  );

  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.userId, userId),
  });

  return c.html(renderSettingsPage(user, calendars, typesWithLocations, rules, env.GOOGLE_MAPS_API_KEY));
});

// ── API: Refresh Calendars ──────────────────────────────────────────────────

settingsRoutes.post("/:userId/calendars/refresh", async (c) => {
  const { userId } = c.req.param();

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.googleTokens) {
    return c.json({ error: "No Google Calendar connected" }, 400);
  }

  const tokens = user.googleTokens as {
    access_token?: string | null;
    refresh_token?: string | null;
  };

  const calendars = await listCalendars(tokens);

  for (const cal of calendars) {
    await db
      .insert(userCalendars)
      .values({
        userId,
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

  return c.json({ status: "ok", count: calendars.length });
});

// ── API: Toggle Calendar Conflict Checking ──────────────────────────────────

settingsRoutes.post("/:userId/calendars/:calendarDbId/toggle", async (c) => {
  const { calendarDbId } = c.req.param();

  const cal = await db.query.userCalendars.findFirst({
    where: eq(userCalendars.id, calendarDbId),
  });

  if (!cal) {
    return c.json({ error: "Calendar not found" }, 404);
  }

  await db
    .update(userCalendars)
    .set({ checkForConflicts: !cal.checkForConflicts })
    .where(eq(userCalendars.id, calendarDbId));

  return c.json({ status: "ok", checkForConflicts: !cal.checkForConflicts });
});

// ── API: Create/Update Meeting Type ─────────────────────────────────────────

settingsRoutes.post("/:userId/meeting-types", async (c) => {
  const { userId } = c.req.param();
  const body = await c.req.json<{
    id?: string;
    name: string;
    slug: string;
    isOnline: boolean;
    defaultDuration: number;
    defaultLocation?: string;
    earliestTime?: string;
    latestTime?: string;
    isDefault?: boolean;
  }>();

  if (body.id) {
    // Update existing
    await db
      .update(meetingTypes)
      .set({
        name: body.name,
        slug: body.slug,
        isOnline: body.isOnline,
        defaultDuration: body.defaultDuration,
        defaultLocation: body.defaultLocation ?? null,
        earliestTime: body.earliestTime ?? null,
        latestTime: body.latestTime ?? null,
        isDefault: body.isDefault ?? false,
      })
      .where(eq(meetingTypes.id, body.id));
    return c.json({ status: "updated" });
  }

  // If setting as default, unset other defaults first
  if (body.isDefault) {
    await db
      .update(meetingTypes)
      .set({ isDefault: false })
      .where(eq(meetingTypes.userId, userId));
  }

  const [created] = await db
    .insert(meetingTypes)
    .values({
      userId,
      name: body.name,
      slug: body.slug,
      isOnline: body.isOnline,
      defaultDuration: body.defaultDuration,
      defaultLocation: body.defaultLocation ?? null,
      earliestTime: body.earliestTime ?? null,
      latestTime: body.latestTime ?? null,
      isDefault: body.isDefault ?? false,
    })
    .returning();

  return c.json({ status: "created", id: created.id });
});

// ── API: Delete Meeting Type ────────────────────────────────────────────────

settingsRoutes.post("/:userId/meeting-types/:typeId/delete", async (c) => {
  const { typeId } = c.req.param();

  // Delete associated locations first
  await db.delete(meetingLocations).where(eq(meetingLocations.meetingTypeId, typeId));
  await db.delete(meetingTypes).where(eq(meetingTypes.id, typeId));

  return c.json({ status: "deleted" });
});

// ── API: Create/Update Location ─────────────────────────────────────────────

settingsRoutes.post("/:userId/locations", async (c) => {
  const body = await c.req.json<{
    id?: string;
    meetingTypeId: string;
    name: string;
    address?: string;
    notes?: string;
    sortOrder?: number;
  }>();

  if (body.id) {
    await db
      .update(meetingLocations)
      .set({
        name: body.name,
        address: body.address ?? null,
        notes: body.notes ?? null,
        sortOrder: body.sortOrder ?? 0,
      })
      .where(eq(meetingLocations.id, body.id));
    return c.json({ status: "updated" });
  }

  const [created] = await db
    .insert(meetingLocations)
    .values({
      meetingTypeId: body.meetingTypeId,
      name: body.name,
      address: body.address ?? null,
      notes: body.notes ?? null,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  return c.json({ status: "created", id: created.id });
});

// ── API: Delete Location ────────────────────────────────────────────────────

settingsRoutes.post("/:userId/locations/:locationId/delete", async (c) => {
  const { locationId } = c.req.param();
  await db.delete(meetingLocations).where(eq(meetingLocations.id, locationId));
  return c.json({ status: "deleted" });
});

// ── API: Save Availability Rule ─────────────────────────────────────────────

settingsRoutes.post("/:userId/availability", async (c) => {
  const { userId } = c.req.param();
  const body = await c.req.json<{
    id?: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>();

  if (body.id) {
    await db
      .update(availabilityRules)
      .set({
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        isActive: body.isActive,
      })
      .where(eq(availabilityRules.id, body.id));
    return c.json({ status: "updated" });
  }

  const [created] = await db
    .insert(availabilityRules)
    .values({
      userId,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      isActive: body.isActive,
    })
    .returning();

  return c.json({ status: "created", id: created.id });
});

// ── API: Delete Availability Rule ───────────────────────────────────────────

settingsRoutes.post("/:userId/availability/:ruleId/delete", async (c) => {
  const { ruleId } = c.req.param();
  await db.delete(availabilityRules).where(eq(availabilityRules.id, ruleId));
  return c.json({ status: "deleted" });
});

// ── HTML Rendering ──────────────────────────────────────────────────────────

type MeetingTypeWithLocations = typeof meetingTypes.$inferSelect & {
  locations: (typeof meetingLocations.$inferSelect)[];
};

/** Convert "HH:MM" or "HH:MM:SS" 24-hour time to 12-hour display (e.g. "9:00 AM"). */
function to12h(time: string | null | undefined): string {
  if (!time) return "any";
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.slice(0, 2)} ${ampm}`;
}

function renderSettingsPage(
  user: typeof users.$inferSelect,
  calendars: (typeof userCalendars.$inferSelect)[],
  types: MeetingTypeWithLocations[],
  rules: (typeof availabilityRules.$inferSelect)[],
  googleMapsApiKey?: string,
): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const calendarRows = calendars
    .map(
      (cal) => `
      <div class="card-row">
        <div>
          <strong>${cal.summary}</strong>
          ${cal.isPrimary ? '<span class="badge">Primary</span>' : ""}
          <div class="text-sm text-muted">${cal.calendarId}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" ${cal.checkForConflicts ? "checked" : ""} onchange="toggleCalendar('${cal.id}')">
          <span class="toggle-label">Check conflicts</span>
        </label>
      </div>`,
    )
    .join("\n");

  const meetingTypeCards = types
    .map(
      (t) => `
      <div class="card" id="type-${t.id}">
        <div class="card-header">
          <div class="card-header-row">
            <div>
              <strong>${t.name}</strong>
              ${t.isDefault ? '<span class="badge default">Default</span>' : ""}
              <span class="badge ${t.isOnline ? "online" : "in-person"}">${t.isOnline ? "Online" : "In-person"}</span>
            </div>
            <div class="card-actions">
              <button class="btn-secondary btn-sm" onclick="showEditType('${t.id}', '${t.name.replace(/'/g, "\\'")}', '${t.slug}', ${t.defaultDuration}, ${t.isOnline}, '${(t.defaultLocation ?? "").replace(/'/g, "\\'")}', ${t.isDefault}, '${t.earliestTime?.slice(0, 5) ?? ""}', '${t.latestTime?.slice(0, 5) ?? ""}')">Edit</button>
              <button class="btn-danger btn-sm" onclick="deleteType('${t.id}')">Delete</button>
            </div>
          </div>
          <div class="text-sm text-muted">${t.defaultDuration} min${t.earliestTime || t.latestTime ? ` · ${to12h(t.earliestTime)} – ${to12h(t.latestTime)}` : ""}${t.defaultLocation ? ` · ${t.defaultLocation}` : ""}</div>
        </div>
        ${
          !t.isOnline
            ? `
        <div class="locations-section">
          <div class="section-title">Locations</div>
          ${t.locations
            .map(
              (l) => `
            <div class="location-row">
              <div>
                <strong>${l.name}</strong>
                ${l.address ? `<div class="text-sm text-muted">${l.address}</div>` : ""}
                ${l.notes ? `<div class="text-sm text-muted italic">${l.notes}</div>` : ""}
              </div>
              <button class="btn-danger btn-sm" onclick="deleteLocation('${l.id}')">Remove</button>
            </div>`,
            )
            .join("\n")}
          <button class="btn-secondary btn-sm" onclick="showAddLocation('${t.id}')">+ Add Location</button>
        </div>`
            : ""
        }
      </div>`,
    )
    .join("\n");

  const availabilityRows = days
    .map((day, i) => {
      const dayRules = rules.filter((r) => r.dayOfWeek === i && r.isActive);
      const rulesHtml = dayRules
        .map(
          (r) => `
          <span class="avail-slot">
            ${to12h(r.startTime)} - ${to12h(r.endTime)}
            <button class="btn-inline-delete" onclick="deleteAvailability('${r.id}')" title="Remove">&times;</button>
          </span>`,
        )
        .join(" ");
      return `
      <div class="card-row avail-row">
        <span class="day-label">${day}</span>
        <div class="avail-slots">
          ${dayRules.length > 0 ? rulesHtml : '<span class="text-sm text-muted">Not available</span>'}
        </div>
        <button class="btn-secondary btn-sm" onclick="showAddAvailability(${i}, '${day}')">+ Add</button>
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings - Luca</title>
  ${googleMapsApiKey ? `<script async src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&loading=async"></script>` : ""}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; padding: 2rem; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin: 2rem 0 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #e5e7eb; }
    .user-info { color: #666; margin-bottom: 2rem; }
    .card { background: white; border-radius: 0.75rem; padding: 1rem; margin-bottom: 0.75rem; border: 1px solid #e5e7eb; }
    .card-header { display: flex; flex-direction: column; gap: 0.25rem; }
    .card-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: white; border-radius: 0.5rem; border: 1px solid #e5e7eb; margin-bottom: 0.5rem; overflow: hidden; min-width: 0; }
    .card-row > div:first-child { min-width: 0; flex: 1; overflow: hidden; }
    .card-row .text-muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 500; margin-left: 0.5rem; }
    .badge.default { background: #dbeafe; color: #1d4ed8; }
    .badge.online { background: #f3e8ff; color: #7c3aed; }
    .badge.in-person { background: #fef3c7; color: #92400e; }
    .text-sm { font-size: 0.875rem; }
    .text-muted { color: #999; }
    .italic { font-style: italic; }
    .section-title { font-size: 0.8rem; font-weight: 600; color: #666; text-transform: uppercase; margin: 0.75rem 0 0.5rem; }
    .day-label { font-weight: 500; min-width: 100px; flex-shrink: 0; }
    .avail-row { flex-wrap: wrap; gap: 0.5rem; }
    .avail-slots { flex: 1; display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
    .avail-slot { display: inline-flex; align-items: center; gap: 0.25rem; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 0.125rem 0.5rem; border-radius: 1rem; font-size: 0.8rem; font-weight: 500; }
    .btn-inline-delete { background: none; border: none; color: #999; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.125rem; }
    .btn-inline-delete:hover { color: #ef4444; }
    .card-header-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .card-actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
    .locations-section { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #f0f0f0; }
    .location-row { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; margin-bottom: 0.25rem; border-radius: 0.25rem; }
    .location-row:hover { background: #f9fafb; }
    .toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
    .toggle input { width: 1rem; height: 1rem; }
    .toggle-label { font-size: 0.8rem; color: #666; }
    .btn { padding: 0.5rem 1rem; border-radius: 0.5rem; border: none; cursor: pointer; font-size: 0.875rem; font-weight: 500; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-danger { background: none; color: #ef4444; border: none; cursor: pointer; font-size: 0.8rem; }
    .btn-danger:hover { text-decoration: underline; }
    .btn-sm { padding: 0.25rem 0.75rem; font-size: 0.8rem; }
    .form-group { margin-bottom: 0.75rem; }
    .form-group label { display: block; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.25rem; }
    .form-group input, .form-group select { width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; }
    .form-row { display: flex; gap: 0.75rem; }
    .form-row > * { flex: 1; }
    .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 50; justify-content: center; align-items: center; }
    .modal.active { display: flex; }
    .modal-content { background: white; border-radius: 0.75rem; padding: 1.5rem; width: 90%; max-width: 400px; }
    .modal-title { font-weight: 600; margin-bottom: 1rem; }
    .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
    #toast { display: none; position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: #065f46; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-size: 0.875rem; z-index: 100; }
    #toast.show { display: block; }
    .powered-by { text-align: center; margin-top: 3rem; color: #999; font-size: 0.8rem; }
    .pac-container { z-index: 10000 !important; border-radius: 0.5rem; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .pac-item { padding: 0.5rem 0.75rem; font-size: 0.875rem; cursor: pointer; }
    .pac-item:hover { background: #f3f4f6; }
    .pac-item-selected { background: #eff6ff; }
    .pac-icon { display: none; }
    .pac-item-query { font-weight: 600; font-size: 0.875rem; }
    .autocomplete-hint { font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Settings</h1>
    <p class="user-info">${user.name} · ${user.email} · ${user.timezone}</p>

    <!-- Calendars Section -->
    <h2>Calendars</h2>
    <p class="text-sm text-muted" style="margin-bottom: 0.75rem;">Toggle which calendars Luca checks for conflicts when proposing meeting times.</p>
    ${calendarRows || '<p class="text-sm text-muted">No calendars synced yet. Connect Google Calendar first.</p>'}
    <button class="btn btn-secondary" style="margin-top: 0.5rem;" onclick="refreshCalendars()">Refresh Calendars</button>

    <!-- Availability Section -->
    <h2>Availability</h2>
    ${availabilityRows}

    <!-- Meeting Types Section -->
    <h2>Meeting Types</h2>
    <p class="text-sm text-muted" style="margin-bottom: 0.75rem;">Configure different types of meetings with default durations and locations.</p>
    ${meetingTypeCards}
    <button class="btn btn-primary" style="margin-top: 0.5rem;" onclick="showAddType()">+ New Meeting Type</button>

    <p class="powered-by">Powered by Luca</p>
  </div>

  <!-- Add/Edit Meeting Type Modal -->
  <div class="modal" id="typeModal">
    <div class="modal-content">
      <div class="modal-title" id="typeModalTitle">New Meeting Type</div>
      <input type="hidden" id="typeId">
      <div class="form-row">
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="typeName" placeholder="e.g. Coffee">
        </div>
        <div class="form-group">
          <label>Slug</label>
          <input type="text" id="typeSlug" placeholder="e.g. coffee">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Duration (min)</label>
          <input type="number" id="typeDuration" value="30">
        </div>
        <div class="form-group">
          <label>Format</label>
          <select id="typeOnline">
            <option value="true">Online</option>
            <option value="false">In-person</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Default Location (optional)</label>
        <input type="text" id="typeLocation" placeholder="e.g. Zoom, Office">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Earliest Time (optional)</label>
          <input type="time" id="typeEarliest" placeholder="e.g. 07:00">
        </div>
        <div class="form-group">
          <label>Latest Time (optional)</label>
          <input type="time" id="typeLatest" placeholder="e.g. 11:00">
        </div>
      </div>
      <p class="text-sm text-muted" style="margin-bottom: 0.75rem;">Restrict when Luca proposes this type of meeting. Leave blank for no restriction.</p>
      <div class="form-group">
        <label><input type="checkbox" id="typeDefault"> Set as default</label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal('typeModal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveType()">Save</button>
      </div>
    </div>
  </div>

  <!-- Add Location Modal -->
  <div class="modal" id="locationModal">
    <div class="modal-content">
      <div class="modal-title">Add Location</div>
      <input type="hidden" id="locTypeId">
      <div class="form-group">
        <label>Search Place</label>
        <input type="text" id="locSearch" placeholder="Search for a place..." autocomplete="off">
        <p class="autocomplete-hint">Start typing to search Google Maps, or enter manually below</p>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="locName" placeholder="e.g. Blue Bottle Coffee">
      </div>
      <div class="form-group">
        <label>Address</label>
        <input type="text" id="locAddress" placeholder="e.g. 123 Main St, New York, NY">
      </div>
      <div class="form-group">
        <label>Notes (optional)</label>
        <input type="text" id="locNotes" placeholder="e.g. 2nd floor, by the window">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal('locationModal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveLocation()">Save</button>
      </div>
    </div>
  </div>

  <!-- Add Availability Modal -->
  <div class="modal" id="availModal">
    <div class="modal-content">
      <div class="modal-title" id="availModalTitle">Add Availability</div>
      <input type="hidden" id="availDayOfWeek">
      <div class="form-row">
        <div class="form-group">
          <label>Start Time</label>
          <input type="time" id="availStart" value="09:00">
        </div>
        <div class="form-group">
          <label>End Time</label>
          <input type="time" id="availEnd" value="17:00">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal('availModal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveAvailability()">Save</button>
      </div>
    </div>
  </div>

  <div id="toast"></div>

  <script>
    const userId = '${user.id}';

    function toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    // ── Calendars ──────────────────

    async function refreshCalendars() {
      try {
        const res = await fetch('/settings/' + userId + '/calendars/refresh', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          toast('Synced ' + data.count + ' calendars');
          setTimeout(() => location.reload(), 1000);
        } else {
          toast('Error: ' + (data.error || 'Failed to refresh'));
        }
      } catch (e) {
        toast('Network error: ' + e.message);
      }
    }

    async function toggleCalendar(calendarDbId) {
      await fetch('/settings/' + userId + '/calendars/' + calendarDbId + '/toggle', { method: 'POST' });
      toast('Calendar updated');
    }

    // ── Availability ──────────────

    function showAddAvailability(dayOfWeek, dayName) {
      document.getElementById('availModalTitle').textContent = 'Add Availability — ' + dayName;
      document.getElementById('availDayOfWeek').value = dayOfWeek;
      document.getElementById('availStart').value = '09:00';
      document.getElementById('availEnd').value = '17:00';
      document.getElementById('availModal').classList.add('active');
    }

    async function saveAvailability() {
      const payload = {
        dayOfWeek: parseInt(document.getElementById('availDayOfWeek').value),
        startTime: document.getElementById('availStart').value + ':00',
        endTime: document.getElementById('availEnd').value + ':00',
        isActive: true,
      };

      await fetch('/settings/' + userId + '/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      closeModal('availModal');
      toast('Availability saved');
      setTimeout(() => location.reload(), 500);
    }

    async function deleteAvailability(ruleId) {
      if (!confirm('Remove this availability window?')) return;
      await fetch('/settings/' + userId + '/availability/' + ruleId + '/delete', { method: 'POST' });
      toast('Availability removed');
      setTimeout(() => location.reload(), 500);
    }

    // ── Meeting Types ──────────────

    function showAddType() {
      document.getElementById('typeModalTitle').textContent = 'New Meeting Type';
      document.getElementById('typeId').value = '';
      document.getElementById('typeName').value = '';
      document.getElementById('typeSlug').value = '';
      document.getElementById('typeDuration').value = '30';
      document.getElementById('typeOnline').value = 'true';
      document.getElementById('typeLocation').value = '';
      document.getElementById('typeEarliest').value = '';
      document.getElementById('typeLatest').value = '';
      document.getElementById('typeDefault').checked = false;
      document.getElementById('typeModal').classList.add('active');
    }

    function showEditType(id, name, slug, duration, isOnline, location, isDefault, earliest, latest) {
      document.getElementById('typeModalTitle').textContent = 'Edit Meeting Type';
      document.getElementById('typeId').value = id;
      document.getElementById('typeName').value = name;
      document.getElementById('typeSlug').value = slug;
      document.getElementById('typeDuration').value = duration;
      document.getElementById('typeOnline').value = isOnline ? 'true' : 'false';
      document.getElementById('typeLocation').value = location || '';
      document.getElementById('typeEarliest').value = earliest || '';
      document.getElementById('typeLatest').value = latest || '';
      document.getElementById('typeDefault').checked = isDefault;
      document.getElementById('typeModal').classList.add('active');
    }

    async function saveType() {
      const earliestVal = document.getElementById('typeEarliest').value;
      const latestVal = document.getElementById('typeLatest').value;
      const payload = {
        id: document.getElementById('typeId').value || undefined,
        name: document.getElementById('typeName').value,
        slug: document.getElementById('typeSlug').value,
        isOnline: document.getElementById('typeOnline').value === 'true',
        defaultDuration: parseInt(document.getElementById('typeDuration').value),
        defaultLocation: document.getElementById('typeLocation').value || undefined,
        earliestTime: earliestVal ? earliestVal + ':00' : undefined,
        latestTime: latestVal ? latestVal + ':00' : undefined,
        isDefault: document.getElementById('typeDefault').checked,
      };

      await fetch('/settings/' + userId + '/meeting-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      closeModal('typeModal');
      toast('Meeting type saved');
      setTimeout(() => location.reload(), 500);
    }

    async function deleteType(typeId) {
      if (!confirm('Delete this meeting type and all its locations?')) return;
      await fetch('/settings/' + userId + '/meeting-types/' + typeId + '/delete', { method: 'POST' });
      toast('Meeting type deleted');
      setTimeout(() => location.reload(), 500);
    }

    // ── Locations ──────────────────

    function showAddLocation(meetingTypeId) {
      document.getElementById('locTypeId').value = meetingTypeId;
      document.getElementById('locSearch').value = '';
      document.getElementById('locName').value = '';
      document.getElementById('locAddress').value = '';
      document.getElementById('locNotes').value = '';
      document.getElementById('locationModal').classList.add('active');
      // Focus search field after modal opens
      setTimeout(() => document.getElementById('locSearch').focus(), 100);
    }

    async function saveLocation() {
      const payload = {
        meetingTypeId: document.getElementById('locTypeId').value,
        name: document.getElementById('locName').value,
        address: document.getElementById('locAddress').value || undefined,
        notes: document.getElementById('locNotes').value || undefined,
      };

      await fetch('/settings/' + userId + '/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      closeModal('locationModal');
      toast('Location added');
      setTimeout(() => location.reload(), 500);
    }

    async function deleteLocation(locationId) {
      if (!confirm('Remove this location?')) return;
      await fetch('/settings/' + userId + '/locations/' + locationId + '/delete', { method: 'POST' });
      toast('Location removed');
      setTimeout(() => location.reload(), 500);
    }

    // ── Google Places Autocomplete ──
    ${googleMapsApiKey ? `
    let placesAutocomplete = null;

    function initPlacesAutocomplete() {
      if (!window.google?.maps?.places) return;

      // Location search field in the Add Location modal
      const searchInput = document.getElementById('locSearch');
      if (searchInput) {
        placesAutocomplete = new google.maps.places.Autocomplete(searchInput, {
          types: ['establishment'],
          fields: ['name', 'formatted_address', 'geometry', 'url', 'place_id'],
        });

        placesAutocomplete.addListener('place_changed', function() {
          const place = placesAutocomplete.getPlace();
          if (!place || !place.name) return;

          document.getElementById('locName').value = place.name;
          document.getElementById('locAddress').value = place.formatted_address || '';

          // Add Google Maps link to notes if available
          if (place.url) {
            const existingNotes = document.getElementById('locNotes').value;
            if (!existingNotes) {
              document.getElementById('locNotes').value = place.url;
            }
          }
        });
      }

      // Default location field in the Meeting Type modal
      const typeLocInput = document.getElementById('typeLocation');
      if (typeLocInput) {
        const typeLocAC = new google.maps.places.Autocomplete(typeLocInput, {
          types: ['establishment'],
          fields: ['name', 'formatted_address'],
        });

        typeLocAC.addListener('place_changed', function() {
          const place = typeLocAC.getPlace();
          if (!place) return;
          typeLocInput.value = place.name + (place.formatted_address ? ' — ' + place.formatted_address : '');
        });
      }
    }

    // Wait for Google Maps to load, then init
    function waitForGoogleMaps() {
      if (window.google?.maps?.places) {
        initPlacesAutocomplete();
      } else {
        setTimeout(waitForGoogleMaps, 200);
      }
    }
    waitForGoogleMaps();
    ` : '// Google Maps API key not configured — location autocomplete disabled'}
  </script>
</body>
</html>`;
}
