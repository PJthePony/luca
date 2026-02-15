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

  return c.json({ status: "ok", count: calendars.length });
});

// ── API: Toggle Calendar Conflict Checking ──────────────────────────────────

settingsRoutes.post("/calendars/:calendarDbId/toggle", async (c) => {
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

settingsRoutes.post("/meeting-types/:typeId/delete", async (c) => {
  const { typeId } = c.req.param();

  // Delete associated locations first
  await db.delete(meetingLocations).where(eq(meetingLocations.meetingTypeId, typeId));
  await db.delete(meetingTypes).where(eq(meetingTypes.id, typeId));

  return c.json({ status: "deleted" });
});

// ── API: Create/Update Location ─────────────────────────────────────────────

settingsRoutes.post("/locations", async (c) => {
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

settingsRoutes.post("/locations/:locationId/delete", async (c) => {
  const { locationId } = c.req.param();
  await db.delete(meetingLocations).where(eq(meetingLocations.id, locationId));
  return c.json({ status: "deleted" });
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
      <span class="app-header-user">${user.name} · ${user.email}</span>
      <button class="logout-btn" onclick="window.location.href='/auth/logout'">Sign out</button>
    </div>
  </header>
  <div class="container">
    <h1>Settings</h1>
    <p class="text-sm text-muted" style="margin-bottom: 1.5rem;">${user.timezone}</p>

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

    <div class="powered-by" style="display:flex;align-items:center;justify-content:center;gap:6px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 616 592" width="16" height="15"><path fill="#94a3b8" d="M119.109314,268.061066 C119.065285,263.325195 119.021263,258.589325 119.420914,253.195648 C119.899323,242.687317 119.934067,232.836807 119.968811,222.986298 C120.800987,210.330612 123.749130,198.051819 130.022232,187.148956 C137.736633,173.741104 148.846756,163.252960 162.535645,155.775253 C177.100540,147.819016 192.593552,142.449768 209.242828,141.976746 C223.559692,141.570007 237.812744,141.039062 252.154831,144.617920 C273.670197,149.986786 292.434082,159.494934 306.836853,176.352234 C316.382935,187.525162 322.795990,200.502365 325.209320,215.330582 C328.161682,233.470703 328.493927,251.657272 324.792206,269.554535 C321.997345,283.067200 316.005096,295.484344 307.170441,306.479218 C294.397064,322.375885 278.384277,333.158325 259.423370,340.539703 C246.236389,345.673340 232.911880,349.025574 218.088699,349.945282 C200.892609,349.929962 184.498352,349.958618 168.104431,350.046082 C167.420395,350.049744 166.739273,350.602264 166.056793,350.899109 C162.329681,350.556122 158.602585,350.213165 154.038422,349.793182 C154.038422,351.846741 154.038651,353.429077 154.038406,355.011444 C154.033615,384.823303 154.195099,414.637177 153.832260,444.444702 C153.781830,448.587372 151.928940,453.235229 149.544754,456.712952 C144.536331,464.018555 138.879166,471.054535 128.118103,471.963043 C125.020271,471.874054 122.776718,471.874054 119.837013,471.874054 C119.837013,465.352509 119.837013,459.164246 119.932861,452.517456 C120.024239,392.235413 120.026398,332.411835 119.977417,272.588318 C119.976181,271.079010 119.411316,269.570129 119.109314,268.061066 M253.971176,172.347809 C253.971176,172.347809 253.941376,171.986420 253.598969,171.392090 C247.106262,169.616547 240.613556,167.840988 233.168472,166.047073 C218.891144,165.223083 204.959579,166.354431 191.542038,172.013748 C178.992920,177.306763 169.156067,185.260483 162.296524,197.236053 C155.526398,209.055542 154.530807,222.078064 154.226730,234.945572 C153.569427,262.760132 154.004089,290.600922 154.056473,318.430847 C154.059799,320.200897 154.378281,322.060120 155.004868,323.704620 C155.364395,324.648163 156.587418,325.819214 157.512360,325.904480 C166.426300,326.726410 175.360962,327.883972 184.286865,327.860779 C193.499634,327.836792 202.705093,326.545105 211.921204,325.917389 C226.588089,324.918365 240.394608,321.086945 253.262466,313.882812 C265.384796,307.096069 275.851776,298.262421 282.648987,286.206970 C290.479553,272.318756 293.654480,256.843506 293.995331,240.913971 C294.244324,229.278183 292.186462,217.849808 287.736237,207.188934 C283.770874,197.689529 278.586029,188.609863 269.772888,182.472061 C264.819977,179.022690 259.664764,175.863724 254.454681,172.587509 C254.454681,172.587509 254.325699,172.423904 253.971176,172.347809z"/><path fill="#94a3b8" d="M247.005768,428.205750 C245.663971,432.868622 244.308578,437.527649 242.983002,442.195129 C239.518250,454.394775 240.070877,466.222809 244.934296,478.129791 C249.516235,489.347687 256.369904,498.545868 267.323792,503.460571 C282.841003,510.422821 298.886688,511.283508 314.993896,504.495453 C334.974365,496.075104 343.956146,480.233307 346.048920,459.536285 C346.112244,458.909943 346.499634,458.316376 346.825378,456.850159 C346.925110,369.104584 346.919556,282.216400 346.953857,195.328217 C346.966675,162.873291 347.072479,130.418396 347.272552,97.880379 C347.608673,97.485947 347.530823,97.236328 347.108276,96.817688 C347.040863,96.586952 346.934967,96.118011 346.934967,96.118011 C352.031250,96.264946 357.198944,95.925606 362.208771,96.661201 C372.281128,98.140129 376.801727,105.660172 379.592041,114.951706 C379.186401,116.400421 379.119385,117.229019 379.119141,118.057640 C379.088470,230.704987 379.062622,343.352325 379.036560,455.999664 C379.025726,459.180939 379.630737,462.515442 378.884674,465.513763 C376.916382,473.424469 375.341248,481.662933 371.835388,488.912964 C364.686096,503.697205 353.884613,515.056396 338.664917,522.570129 C330.317780,526.691040 321.879791,529.601074 312.975494,531.618164 C310.993317,532.067200 308.867554,531.882141 305.975769,531.907227 C297.026794,531.882385 288.909943,531.939392 280.793060,531.996399 C263.775665,531.467102 249.070343,524.935059 235.479263,515.063660 C224.521530,507.104919 216.921844,496.566956 212.257874,484.221466 C209.659729,477.344208 208.732895,469.649231 208.174332,462.238220 C207.570587,454.227539 207.129379,446.039703 209.496704,438.121826 C211.094040,432.779266 213.439209,427.993469 220.032684,426.452332 C228.009033,426.758850 235.322693,426.755768 242.631226,426.947937 C244.099426,426.986572 245.548096,427.767242 247.005768,428.205750z"/><path fill="#94a3b8" d="M451.963593,443.177002 C427.914856,434.455200 415.986237,414.103027 415.411621,390.220673 C415.879700,388.855652 416.004639,388.197388 416.004730,387.539093 C416.009796,343.116638 416.006287,298.694153 415.992889,254.271698 C415.992523,253.112198 415.916016,251.946091 415.729462,250.806900 C415.715668,250.722809 414.516388,250.832870 413.868225,250.852661 C407.555389,250.914581 401.241119,250.915848 394.930450,251.067291 C392.286621,251.130768 390.895081,250.344666 390.940308,247.418091 C391.047791,240.462433 390.974884,233.503983 390.974884,225.976379 C398.828156,225.976379 406.411438,225.976379 414.822754,225.743317 C415.768738,223.527054 415.985077,221.544083 415.989685,219.560608 C416.044830,195.762238 416.068634,171.963791 416.100586,148.165375 C423.181671,148.105972 430.273590,147.781509 437.340485,148.070023 C443.114441,148.305786 447.246063,151.330765 448.656128,157.684113 C448.513153,161.668213 448.821625,165.073669 448.853699,168.481705 C448.959290,179.704529 448.964783,190.928284 449.008728,202.151688 C449.008728,202.151688 449.018829,202.494049 448.685669,202.998260 C448.241241,210.084259 448.047852,216.666870 448.113068,223.246933 C448.122162,224.163544 449.404541,225.067535 450.097504,225.977371 C450.097504,225.977371 450.000458,226.004669 450.279724,226.258911 C452.192688,226.662979 453.826355,226.942062 455.460175,226.943237 C479.511414,226.960663 503.563660,227.053558 527.613037,226.837463 C532.549683,226.793106 536.576172,226.943451 537.072083,233.079651 C534.776001,242.831268 528.064575,247.819458 517.927246,250.029266 C495.311096,249.953568 473.549225,249.853638 451.787689,249.908157 C450.868378,249.910461 449.952667,251.347778 449.035278,252.116592 C449.035278,252.116592 449.013153,252.505493 448.684204,253.030884 C448.263367,253.874420 448.091248,254.192474 448.090942,254.510681 C448.049408,298.519501 448.005951,342.528381 448.068634,386.537048 C448.070312,387.715454 449.227966,388.892242 449.846558,390.069794 C449.799530,399.077423 452.542480,407.437195 458.681244,413.717041 C462.416504,417.538055 468.021759,420.735352 473.246277,421.684326 C494.007141,425.455200 513.889160,422.743622 531.867310,410.707336 C533.159851,409.842041 534.698181,409.344025 536.142822,408.665619 C540.565063,419.312500 524.453857,437.254242 507.092255,442.014038 C505.922485,442.365173 505.455780,442.728912 504.989075,443.092651 C504.989044,443.092651 505.002228,443.011047 504.625122,442.915222 C495.034790,443.915314 485.830841,445.767944 476.605591,445.881073 C468.403870,445.981598 460.178528,444.153717 451.963593,443.177002z"/></svg>
    </div>
  </div>

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

    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) closeModal(m.id);
      });
    });

    // ── Calendars ──────────────────

    async function refreshCalendars() {
      try {
        const res = await fetch('/settings/calendars/refresh', { method: 'POST' });
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
      await fetch('/settings/calendars/' + calendarDbId + '/toggle', { method: 'POST' });
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

      await fetch('/settings/availability', {
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

      await fetch('/settings/meeting-types', {
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

      await fetch('/settings/locations', {
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
