import { Hono } from "hono";
import { eq, and, notInArray } from "drizzle-orm";
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
import { authMiddleware } from "../middleware/auth.js";
import { fontLinks, baseStyles, settingsStyles, headerStyles, logoSvg } from "../lib/styles.js";

type User = typeof users.$inferSelect;

export const settingsRoutes = new Hono<{ Variables: { user: User } }>();

// Apply auth middleware to all settings routes
settingsRoutes.use("*", authMiddleware);

// ── Main Settings Page ──────────────────────────────────────────────────────

settingsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const userId = user.id;

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

// ── API: Settings Body (partial HTML for in-place refresh) ─────────────────

settingsRoutes.get("/body", async (c) => {
  const user = c.get("user");
  const userId = user.id;

  const calendars = await db.query.userCalendars.findMany({
    where: eq(userCalendars.userId, userId),
  });

  const types = await db.query.meetingTypes.findMany({
    where: eq(meetingTypes.userId, userId),
  });

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

  return c.html(renderSettingsBody(user, calendars, typesWithLocations, rules, env.GOOGLE_MAPS_API_KEY));
});

// ── API: Refresh Calendars ──────────────────────────────────────────────────

settingsRoutes.post("/calendars/refresh", async (c) => {
  const user = c.get("user");
  const userId = user.id;

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

  // Remove calendars that no longer exist in the user's Google account
  const freshCalendarIds = calendars.map((c) => c.calendarId);
  if (freshCalendarIds.length > 0) {
    await db
      .delete(userCalendars)
      .where(
        and(
          eq(userCalendars.userId, userId),
          notInArray(userCalendars.calendarId, freshCalendarIds),
        ),
      );
  } else {
    // Google returned zero calendars — remove all synced entries
    await db
      .delete(userCalendars)
      .where(eq(userCalendars.userId, userId));
  }

  return c.json({ status: "ok", count: calendars.length });
});

// ── API: Toggle Calendar Conflict Checking ──────────────────────────────────

settingsRoutes.post("/calendars/:calendarDbId/toggle", async (c) => {
  const { calendarDbId } = c.req.param();
  const userId = c.get("user").id;

  const cal = await db.query.userCalendars.findFirst({
    where: and(eq(userCalendars.id, calendarDbId), eq(userCalendars.userId, userId)),
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

settingsRoutes.post("/meeting-types", async (c) => {
  const userId = c.get("user").id;
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
    // Update existing — verify ownership
    const existing = await db.query.meetingTypes.findFirst({
      where: and(eq(meetingTypes.id, body.id), eq(meetingTypes.userId, userId)),
    });
    if (!existing) {
      return c.json({ error: "Meeting type not found" }, 404);
    }

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

settingsRoutes.post("/meeting-types/:typeId/delete", async (c) => {
  const { typeId } = c.req.param();
  const userId = c.get("user").id;

  // Verify ownership
  const existing = await db.query.meetingTypes.findFirst({
    where: and(eq(meetingTypes.id, typeId), eq(meetingTypes.userId, userId)),
  });
  if (!existing) {
    return c.json({ error: "Meeting type not found" }, 404);
  }

  // Delete associated locations first
  await db.delete(meetingLocations).where(eq(meetingLocations.meetingTypeId, typeId));
  await db.delete(meetingTypes).where(eq(meetingTypes.id, typeId));

  return c.json({ status: "deleted" });
});

// ── API: Create/Update Location ─────────────────────────────────────────────

settingsRoutes.post("/locations", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json<{
    id?: string;
    meetingTypeId: string;
    name: string;
    address?: string;
    notes?: string;
    sortOrder?: number;
  }>();

  // Verify the meeting type belongs to the user
  const ownerType = await db.query.meetingTypes.findFirst({
    where: and(eq(meetingTypes.id, body.meetingTypeId), eq(meetingTypes.userId, userId)),
  });
  if (!ownerType) {
    return c.json({ error: "Meeting type not found" }, 404);
  }

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

settingsRoutes.post("/locations/:locationId/delete", async (c) => {
  const { locationId } = c.req.param();
  const userId = c.get("user").id;

  // Verify ownership through the meeting type
  const location = await db.query.meetingLocations.findFirst({
    where: eq(meetingLocations.id, locationId),
  });
  if (location) {
    const ownerType = await db.query.meetingTypes.findFirst({
      where: and(eq(meetingTypes.id, location.meetingTypeId), eq(meetingTypes.userId, userId)),
    });
    if (!ownerType) {
      return c.json({ error: "Location not found" }, 404);
    }
  }

  await db.delete(meetingLocations).where(eq(meetingLocations.id, locationId));
  return c.json({ status: "deleted" });
});

// ── API: Save Timezone ──────────────────────────────────────────────────────

settingsRoutes.post("/timezone", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json<{ timezone: string }>();
  const tz = body.timezone?.trim();

  if (!tz) {
    return c.json({ error: "Timezone is required" }, 400);
  }

  await db
    .update(users)
    .set({ timezone: tz })
    .where(eq(users.id, userId));

  return c.json({ status: "ok" });
});

// ── API: Save Work Email ────────────────────────────────────────────────────

settingsRoutes.post("/work-email", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json<{ workEmail?: string }>();

  await db
    .update(users)
    .set({ workEmail: body.workEmail?.trim() || null })
    .where(eq(users.id, userId));

  return c.json({ status: "ok" });
});

// ── API: Save Availability Rule ─────────────────────────────────────────────

settingsRoutes.post("/availability", async (c) => {
  const userId = c.get("user").id;
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

settingsRoutes.post("/availability/:ruleId/delete", async (c) => {
  const { ruleId } = c.req.param();
  const userId = c.get("user").id;

  // Verify ownership
  const rule = await db.query.availabilityRules.findFirst({
    where: and(eq(availabilityRules.id, ruleId), eq(availabilityRules.userId, userId)),
  });
  if (!rule) {
    return c.json({ error: "Availability rule not found" }, 404);
  }

  await db.delete(availabilityRules).where(eq(availabilityRules.id, ruleId));
  return c.json({ status: "deleted" });
});

// ── HTML Rendering ──────────────────────────────────────────────────────────

export type MeetingTypeWithLocations = typeof meetingTypes.$inferSelect & {
  locations: (typeof meetingLocations.$inferSelect)[];
};

/** Convert "HH:MM" or "HH:MM:SS" 24-hour time to 12-hour display (e.g. "9:00 AM"). */
export function to12h(time: string | null | undefined): string {
  if (!time) return "any";
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.slice(0, 2)} ${ampm}`;
}

const COMMON_TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Phoenix",
  "America/Toronto", "America/Vancouver",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Amsterdam", "Europe/Rome",
  "Europe/Madrid", "Europe/Zurich", "Europe/Stockholm", "Europe/Warsaw",
  "Europe/Athens", "Europe/Moscow",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Seoul", "Asia/Hong_Kong",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Perth",
  "Pacific/Auckland",
  "America/Sao_Paulo", "America/Argentina/Buenos_Aires", "America/Mexico_City",
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos",
];

function renderTimezoneOptions(currentTz: string | null | undefined): string {
  const tz = currentTz || "America/New_York";
  // If the user's timezone isn't in our list, add it
  const zones = COMMON_TIMEZONES.includes(tz) ? COMMON_TIMEZONES : [tz, ...COMMON_TIMEZONES];
  return zones
    .map((z) => `<option value="${z}"${z === tz ? " selected" : ""}>${z.replace(/_/g, " ")}</option>`)
    .join("\n");
}

/**
 * Renders the inner settings content (HTML + modals + scripts) without any page wrapper.
 * Used by the dashboard to embed settings inside a modal.
 */
export function renderSettingsBody(
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

  return `
    <!-- Timezone Section -->
    <h2>Timezone</h2>
    <div class="form-group" style="display:flex;gap:0.5rem;align-items:flex-end;">
      <div style="flex:1;">
        <select id="timezoneSelect">
          ${renderTimezoneOptions(user.timezone)}
        </select>
      </div>
      <button class="btn btn-primary" onclick="saveTimezone()">Save</button>
    </div>

    <!-- Calendars Section -->
    <h2>Calendars</h2>
    <p class="text-sm text-muted" style="margin-bottom: 0.75rem;">Toggle which calendars Luca checks for conflicts when proposing meeting times.</p>
    ${calendarRows || '<p class="text-sm text-muted">No calendars synced yet. Connect Google Calendar first.</p>'}
    <button class="btn btn-secondary" style="margin-top: 0.5rem;" onclick="refreshCalendars()">Refresh Calendars</button>

    <!-- Work Calendar Section -->
    <h2>Work Calendar</h2>
    <p class="text-sm text-muted" style="margin-bottom: 0.75rem;">Block off your work calendar when meetings are confirmed. An "External Meeting" hold is created — no meeting details are shared, and your work email won't appear on the invite.</p>
    <div class="form-group" style="display:flex;gap:0.5rem;align-items:flex-end;">
      <div style="flex:1;">
        <label>Work Email</label>
        <input type="email" id="workEmail" placeholder="you@company.com" value="${user.workEmail ?? ""}">
      </div>
      <button class="btn btn-primary" onclick="saveWorkEmail()">Save</button>
      ${user.workEmail ? '<button class="btn btn-secondary" onclick="clearWorkEmail()">Remove</button>' : ""}
    </div>

    <!-- Availability Section -->
    <h2>Availability</h2>
    ${availabilityRows}

    <!-- Meeting Types Section -->
    <h2>Meeting Types</h2>
    <p class="text-sm text-muted" style="margin-bottom: 0.75rem;">Configure different types of meetings with default durations and locations.</p>
    ${meetingTypeCards}
    <button class="btn btn-primary" style="margin-top: 0.5rem;" onclick="showAddType()">+ New Meeting Type</button>

  <!-- Add/Edit Meeting Type Modal -->
  <div class="modal" id="typeModal">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title" id="typeModalTitle">New Meeting Type</div>
        <button class="modal-close" onclick="closeModal('typeModal')">&times;</button>
      </div>
      <div class="modal-body">
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
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('typeModal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveType()">Save</button>
      </div>
    </div>
  </div>

  <!-- Add Location Modal -->
  <div class="modal" id="locationModal">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">Add Location</div>
        <button class="modal-close" onclick="closeModal('locationModal')">&times;</button>
      </div>
      <div class="modal-body">
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
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('locationModal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveLocation()">Save</button>
      </div>
    </div>
  </div>

  <!-- Add Availability Modal -->
  <div class="modal" id="availModal">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title" id="availModalTitle">Add Availability</div>
        <button class="modal-close" onclick="closeModal('availModal')">&times;</button>
      </div>
      <div class="modal-body">
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
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('availModal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveAvailability()">Save</button>
      </div>
    </div>
  </div>

  <div id="toast"></div>

  <script>
    function toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    async function refreshSettings() {
      const res = await fetch('/settings/body');
      const html = await res.text();
      // Find the settings container: modal-body on dashboard, .container on standalone page
      const container = document.querySelector('#settingsModal .modal-body') || document.querySelector('.container');
      if (!container) return;
      container.innerHTML = html;
      // Re-execute inline scripts from the new content
      container.querySelectorAll('script').forEach(old => {
        const s = document.createElement('script');
        s.textContent = old.textContent;
        old.replaceWith(s);
      });
    }

    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) closeModal(m.id);
      });
    });

    // ── Timezone ──────────────────

    async function saveTimezone() {
      const tz = document.getElementById('timezoneSelect').value;
      if (!tz) return;
      try {
        const res = await fetch('/settings/timezone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: tz }),
        });
        if (res.ok) {
          toast('Timezone updated');
          refreshSettings();
        } else {
          const data = await res.json();
          toast('Error: ' + (data.error || 'Failed'));
        }
      } catch (e) {
        toast('Network error');
      }
    }

    // ── Calendars ──────────────────

    async function refreshCalendars() {
      try {
        const res = await fetch('/settings/calendars/refresh', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          toast('Calendars refreshed (' + data.count + ' found)');
          refreshSettings();
        } else {
          toast('Error: ' + (data.error || 'Failed to refresh'));
        }
      } catch (e) {
        toast('Network error: ' + e.message);
      }
    }

    async function toggleCalendar(calendarDbId) {
      await fetch('/settings/calendars/' + calendarDbId + '/toggle', { method: 'POST' });
      toast('Calendar updated');
    }

    // ── Work Email ──────────────────

    async function saveWorkEmail() {
      const email = document.getElementById('workEmail').value.trim();
      if (!email) return toast('Please enter a work email');
      await fetch('/settings/work-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workEmail: email }),
      });
      toast('Work email saved');
    }

    async function clearWorkEmail() {
      if (!confirm('Remove work calendar blocking?')) return;
      await fetch('/settings/work-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workEmail: null }),
      });
      document.getElementById('workEmail').value = '';
      toast('Work email removed');
      refreshSettings();
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

      await fetch('/settings/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      closeModal('availModal');
      toast('Availability saved');
      refreshSettings();
    }

    async function deleteAvailability(ruleId) {
      if (!confirm('Remove this availability window?')) return;
      await fetch('/settings/availability/' + ruleId + '/delete', { method: 'POST' });
      toast('Availability removed');
      refreshSettings();
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

      await fetch('/settings/meeting-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      closeModal('typeModal');
      toast('Meeting type saved');
      refreshSettings();
    }

    async function deleteType(typeId) {
      if (!confirm('Delete this meeting type and all its locations?')) return;
      await fetch('/settings/meeting-types/' + typeId + '/delete', { method: 'POST' });
      toast('Meeting type deleted');
      refreshSettings();
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

      await fetch('/settings/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      closeModal('locationModal');
      toast('Location added');
      refreshSettings();
    }

    async function deleteLocation(locationId) {
      if (!confirm('Remove this location?')) return;
      await fetch('/settings/locations/' + locationId + '/delete', { method: 'POST' });
      toast('Location removed');
      refreshSettings();
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
  </script>`;
}

/** Renders the full standalone settings page (used by GET /settings/). */
function renderSettingsPage(
  user: typeof users.$inferSelect,
  calendars: (typeof userCalendars.$inferSelect)[],
  types: MeetingTypeWithLocations[],
  rules: (typeof availabilityRules.$inferSelect)[],
  googleMapsApiKey?: string,
): string {
  const body = renderSettingsBody(user, calendars, types, rules, googleMapsApiKey);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Luca Settings</title>
  ${fontLinks}
  ${googleMapsApiKey ? `<script async src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&loading=async"></script>` : ""}
  <style>
    ${baseStyles}
    ${settingsStyles}
    ${headerStyles}
  </style>
</head>
<body>
  <header class="app-header">
    <a href="/" class="app-header-brand">
      ${logoSvg}
    </a>
    <div class="app-header-nav">
      <button class="logout-btn" onclick="window.location.href='/auth/logout'">Sign out</button>
    </div>
  </header>
  <div class="container">
    <h2 style="margin-top: 0;">Settings</h2>
    ${body}
  </div>
  <div id="toast"></div>
</body>
</html>`;
}
