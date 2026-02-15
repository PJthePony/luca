import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { meetings, meetingLocations, meetingTypes, proposedSlots, participants, users } from "../db/schema.js";
import * as machine from "../services/meeting-machine.js";
import { sendThreadedReply } from "../services/email.js";
import { notifyUser } from "../services/notification.js";
import { findAvailableSlots } from "../services/slot-proposer.js";
import { emailThreads } from "../db/schema.js";
import { env } from "../config.js";
import { fontLinks, baseStyles, meetingStyles, headerStyles, logoSvg } from "../lib/styles.js";

export const meetingRoutes = new Hono();

/**
 * Web picker page — shows proposed time slots for a meeting.
 * GET /meeting/:shortId
 */
meetingRoutes.get("/:shortId", async (c) => {
  const { shortId } = c.req.param();

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.shortId, shortId),
  });

  if (!meeting) {
    return c.html("<h1>Meeting not found</h1>", 404);
  }

  const slots = await db.query.proposedSlots.findMany({
    where: eq(proposedSlots.meetingId, meeting.id),
  });

  const meetingParticipants = await db.query.participants.findMany({
    where: eq(participants.meetingId, meeting.id),
  });

  const organizer = await db.query.users.findFirst({
    where: eq(users.id, meeting.organizerId),
  });

  const tz = organizer?.timezone || "America/New_York";

  // Load locations if this is an in-person meeting type
  let locations: (typeof meetingLocations.$inferSelect)[] = [];
  if (meeting.meetingTypeId) {
    const mType = await db.query.meetingTypes.findFirst({
      where: eq(meetingTypes.id, meeting.meetingTypeId),
    });
    if (mType && !mType.isOnline) {
      locations = await db.query.meetingLocations.findMany({
        where: eq(meetingLocations.meetingTypeId, mType.id),
        orderBy: (loc, { asc }) => [asc(loc.sortOrder)],
      });
    }
  }

  const html = renderMeetingPage(meeting, slots, meetingParticipants, organizer, tz, locations);
  return c.html(html);
});

/**
 * Confirm a time slot via the web picker.
 * POST /meeting/:shortId/select
 */
meetingRoutes.post("/:shortId/select", async (c) => {
  const { shortId } = c.req.param();
  const body = await c.req.json<{ slotId: string; locationId?: string }>();

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.shortId, shortId),
  });

  if (!meeting) {
    return c.json({ error: "Meeting not found" }, 404);
  }

  const organizer = await db.query.users.findFirst({
    where: eq(users.id, meeting.organizerId),
  });

  if (!organizer?.googleTokens) {
    return c.json({ error: "Calendar not connected" }, 400);
  }

  // Save selected location if provided
  if (body.locationId) {
    const location = await db.query.meetingLocations.findFirst({
      where: eq(meetingLocations.id, body.locationId),
    });
    if (location) {
      await db
        .update(meetings)
        .set({
          confirmedLocationId: location.id,
          location: `${location.name}${location.address ? ` - ${location.address}` : ""}`,
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, meeting.id));
    }
  }

  const tokens = organizer.googleTokens as {
    access_token?: string | null;
    refresh_token?: string | null;
  };

  const selectedSlot = await machine.confirmSlot(
    meeting.id,
    body.slotId,
    tokens,
  );

  const tz = organizer.timezone || "America/New_York";
  const confirmedTime = `${selectedSlot.startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz })} at ${selectedSlot.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}`;

  // Send confirmation email in the thread
  const thread = await db.query.emailThreads.findFirst({
    where: eq(emailThreads.meetingId, meeting.id),
  });

  if (thread) {
    const allParticipants = await db.query.participants.findMany({
      where: eq(participants.meetingId, meeting.id),
    });
    const replyTo = allParticipants
      .filter((p) => p.role !== "organizer")
      .map((p) => p.email);

    await sendThreadedReply({
      threadId: thread.id,
      to: replyTo,
      bcc: [organizer.email],
      text: `The meeting has been confirmed for ${confirmedTime}. A calendar invite has been sent.\n\nIf you need to reschedule, just reply to this email or visit: ${env.APP_URL}/meeting/${meeting.shortId}\n\n- Luca`,
    });
  }

  await notifyUser({
    type: "meeting_confirmed",
    userId: organizer.id,
    meetingTitle: meeting.title ?? "Meeting",
    meetingShortId: meeting.shortId,
    confirmedTime,
  });

  return c.json({ status: "confirmed", time: confirmedTime });
});

/**
 * Request new times (none of the proposed times work).
 * POST /meeting/:shortId/more-times
 */
meetingRoutes.post("/:shortId/more-times", async (c) => {
  const { shortId } = c.req.param();

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.shortId, shortId),
  });

  if (!meeting) {
    return c.json({ error: "Meeting not found" }, 404);
  }

  const organizer = await db.query.users.findFirst({
    where: eq(users.id, meeting.organizerId),
  });

  if (!organizer?.googleTokens) {
    return c.json({ error: "Calendar not connected" }, 400);
  }

  const tokens = organizer.googleTokens as {
    access_token?: string | null;
    refresh_token?: string | null;
  };

  // Start rescheduling
  if (meeting.status === "proposed") {
    await machine.startRescheduling(meeting.id, tokens);
  }

  const newSlots = await findAvailableSlots(
    organizer.id,
    meeting.id,
    meeting.durationMin,
    [],
    14,
    meeting.meetingTypeId,
  );

  if (newSlots.length > 0) {
    await machine.proposeTimes(
      meeting.id,
      newSlots.map((s) => ({ start: s.start, end: s.end })),
      tokens,
      meeting.title ?? "Meeting",
    );
  }

  return c.json({ status: "new_times_proposed", count: newSlots.length });
});

// ── HTML Rendering ───────────────────────────────────────────────────────────

function renderMeetingPage(
  meeting: typeof meetings.$inferSelect,
  slots: (typeof proposedSlots.$inferSelect)[],
  meetingParticipants: (typeof participants.$inferSelect)[],
  organizer: typeof users.$inferSelect | null | undefined,
  tz: string,
  locations: (typeof meetingLocations.$inferSelect)[] = [],
): string {
  const isConfirmed = meeting.status === "confirmed";
  const isCancelled = meeting.status === "cancelled";
  const hasLocations = locations.length > 0;

  const slotCards = slots
    .map(
      (s) => `
      <button
        class="slot-card ${s.isSelected ? "selected" : ""}"
        ${isConfirmed || isCancelled ? "disabled" : ""}
        onclick="selectSlot('${s.id}')"
      >
        <div class="slot-date">${s.startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz })}</div>
        <div class="slot-time">${s.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })} - ${s.endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</div>
        ${s.isSelected ? '<div class="slot-confirmed">Confirmed</div>' : ""}
      </button>`,
    )
    .join("\n");

  const locationCards = hasLocations
    ? locations
        .map(
          (l) => `
      <button
        class="location-card"
        ${isConfirmed || isCancelled ? "disabled" : ""}
        onclick="selectLocation('${l.id}')"
        data-location-id="${l.id}"
      >
        <div class="location-name">${l.name}</div>
        ${l.address ? `<div class="location-address">${l.address}</div>` : ""}
        ${l.notes ? `<div class="location-notes">${l.notes}</div>` : ""}
      </button>`,
        )
        .join("\n")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meeting.title ?? "Meeting"} - Luca</title>
  ${fontLinks}
  <style>
    ${baseStyles}
    ${meetingStyles}
    ${headerStyles}
    .container { max-width: 480px; }
  </style>
</head>
<body>
  <header class="app-header">
    <a href="/" class="app-header-brand">
      ${logoSvg}
      <span class="app-header-wordmark">luca</span>
    </a>
  </header>
  <div class="container">
    <h1>${meeting.title ?? "Meeting"}</h1>
    <p class="subtitle">Organized by ${organizer?.name ?? "Unknown"}</p>
    <span class="status ${meeting.status}">${meeting.status}</span>

    ${isConfirmed ? `<p>This meeting is confirmed for <strong>${meeting.confirmedStart?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz })} at ${meeting.confirmedStart?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</strong>.${meeting.location ? ` Location: <strong>${meeting.location}</strong>` : ""}</p>` : ""}

    ${!isConfirmed && !isCancelled ? `<p style="margin-bottom: 1rem;">Pick a time${hasLocations ? " and location" : ""} that works for you:</p>` : ""}

    ${!isConfirmed && !isCancelled && hasLocations ? `<p class="section-label">Time</p>` : ""}

    ${slotCards}

    ${!isConfirmed && !isCancelled && hasLocations ? `
      <p class="section-label">Location</p>
      ${locationCards}
    ` : ""}

    ${!isConfirmed && !isCancelled ? `<button class="none-work" onclick="requestMoreTimes()">None of these work — find more times</button>` : ""}

    <div id="message"></div>

    <div class="powered-by" style="display:flex;align-items:center;justify-content:center;gap:6px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 616 592" width="16" height="15"><path fill="#94a3b8" d="M119.109314,268.061066 C119.065285,263.325195 119.021263,258.589325 119.420914,253.195648 C119.899323,242.687317 119.934067,232.836807 119.968811,222.986298 C120.800987,210.330612 123.749130,198.051819 130.022232,187.148956 C137.736633,173.741104 148.846756,163.252960 162.535645,155.775253 C177.100540,147.819016 192.593552,142.449768 209.242828,141.976746 C223.559692,141.570007 237.812744,141.039062 252.154831,144.617920 C273.670197,149.986786 292.434082,159.494934 306.836853,176.352234 C316.382935,187.525162 322.795990,200.502365 325.209320,215.330582 C328.161682,233.470703 328.493927,251.657272 324.792206,269.554535 C321.997345,283.067200 316.005096,295.484344 307.170441,306.479218 C294.397064,322.375885 278.384277,333.158325 259.423370,340.539703 C246.236389,345.673340 232.911880,349.025574 218.088699,349.945282 C200.892609,349.929962 184.498352,349.958618 168.104431,350.046082 C167.420395,350.049744 166.739273,350.602264 166.056793,350.899109 C162.329681,350.556122 158.602585,350.213165 154.038422,349.793182 C154.038422,351.846741 154.038651,353.429077 154.038406,355.011444 C154.033615,384.823303 154.195099,414.637177 153.832260,444.444702 C153.781830,448.587372 151.928940,453.235229 149.544754,456.712952 C144.536331,464.018555 138.879166,471.054535 128.118103,471.963043 C125.020271,471.874054 122.776718,471.874054 119.837013,471.874054 C119.837013,465.352509 119.837013,459.164246 119.932861,452.517456 C120.024239,392.235413 120.026398,332.411835 119.977417,272.588318 C119.976181,271.079010 119.411316,269.570129 119.109314,268.061066 M253.971176,172.347809 C253.971176,172.347809 253.941376,171.986420 253.598969,171.392090 C247.106262,169.616547 240.613556,167.840988 233.168472,166.047073 C218.891144,165.223083 204.959579,166.354431 191.542038,172.013748 C178.992920,177.306763 169.156067,185.260483 162.296524,197.236053 C155.526398,209.055542 154.530807,222.078064 154.226730,234.945572 C153.569427,262.760132 154.004089,290.600922 154.056473,318.430847 C154.059799,320.200897 154.378281,322.060120 155.004868,323.704620 C155.364395,324.648163 156.587418,325.819214 157.512360,325.904480 C166.426300,326.726410 175.360962,327.883972 184.286865,327.860779 C193.499634,327.836792 202.705093,326.545105 211.921204,325.917389 C226.588089,324.918365 240.394608,321.086945 253.262466,313.882812 C265.384796,307.096069 275.851776,298.262421 282.648987,286.206970 C290.479553,272.318756 293.654480,256.843506 293.995331,240.913971 C294.244324,229.278183 292.186462,217.849808 287.736237,207.188934 C283.770874,197.689529 278.586029,188.609863 269.772888,182.472061 C264.819977,179.022690 259.664764,175.863724 254.454681,172.587509 C254.454681,172.587509 254.325699,172.423904 253.971176,172.347809z"/><path fill="#94a3b8" d="M247.005768,428.205750 C245.663971,432.868622 244.308578,437.527649 242.983002,442.195129 C239.518250,454.394775 240.070877,466.222809 244.934296,478.129791 C249.516235,489.347687 256.369904,498.545868 267.323792,503.460571 C282.841003,510.422821 298.886688,511.283508 314.993896,504.495453 C334.974365,496.075104 343.956146,480.233307 346.048920,459.536285 C346.112244,458.909943 346.499634,458.316376 346.825378,456.850159 C346.925110,369.104584 346.919556,282.216400 346.953857,195.328217 C346.966675,162.873291 347.072479,130.418396 347.272552,97.880379 C347.608673,97.485947 347.530823,97.236328 347.108276,96.817688 C347.040863,96.586952 346.934967,96.118011 346.934967,96.118011 C352.031250,96.264946 357.198944,95.925606 362.208771,96.661201 C372.281128,98.140129 376.801727,105.660172 379.592041,114.951706 C379.186401,116.400421 379.119385,117.229019 379.119141,118.057640 C379.088470,230.704987 379.062622,343.352325 379.036560,455.999664 C379.025726,459.180939 379.630737,462.515442 378.884674,465.513763 C376.916382,473.424469 375.341248,481.662933 371.835388,488.912964 C364.686096,503.697205 353.884613,515.056396 338.664917,522.570129 C330.317780,526.691040 321.879791,529.601074 312.975494,531.618164 C310.993317,532.067200 308.867554,531.882141 305.975769,531.907227 C297.026794,531.882385 288.909943,531.939392 280.793060,531.996399 C263.775665,531.467102 249.070343,524.935059 235.479263,515.063660 C224.521530,507.104919 216.921844,496.566956 212.257874,484.221466 C209.659729,477.344208 208.732895,469.649231 208.174332,462.238220 C207.570587,454.227539 207.129379,446.039703 209.496704,438.121826 C211.094040,432.779266 213.439209,427.993469 220.032684,426.452332 C228.009033,426.758850 235.322693,426.755768 242.631226,426.947937 C244.099426,426.986572 245.548096,427.767242 247.005768,428.205750z"/><path fill="#94a3b8" d="M451.963593,443.177002 C427.914856,434.455200 415.986237,414.103027 415.411621,390.220673 C415.879700,388.855652 416.004639,388.197388 416.004730,387.539093 C416.009796,343.116638 416.006287,298.694153 415.992889,254.271698 C415.992523,253.112198 415.916016,251.946091 415.729462,250.806900 C415.715668,250.722809 414.516388,250.832870 413.868225,250.852661 C407.555389,250.914581 401.241119,250.915848 394.930450,251.067291 C392.286621,251.130768 390.895081,250.344666 390.940308,247.418091 C391.047791,240.462433 390.974884,233.503983 390.974884,225.976379 C398.828156,225.976379 406.411438,225.976379 414.822754,225.743317 C415.768738,223.527054 415.985077,221.544083 415.989685,219.560608 C416.044830,195.762238 416.068634,171.963791 416.100586,148.165375 C423.181671,148.105972 430.273590,147.781509 437.340485,148.070023 C443.114441,148.305786 447.246063,151.330765 448.656128,157.684113 C448.513153,161.668213 448.821625,165.073669 448.853699,168.481705 C448.959290,179.704529 448.964783,190.928284 449.008728,202.151688 C449.008728,202.151688 449.018829,202.494049 448.685669,202.998260 C448.241241,210.084259 448.047852,216.666870 448.113068,223.246933 C448.122162,224.163544 449.404541,225.067535 450.097504,225.977371 C450.097504,225.977371 450.000458,226.004669 450.279724,226.258911 C452.192688,226.662979 453.826355,226.942062 455.460175,226.943237 C479.511414,226.960663 503.563660,227.053558 527.613037,226.837463 C532.549683,226.793106 536.576172,226.943451 537.072083,233.079651 C534.776001,242.831268 528.064575,247.819458 517.927246,250.029266 C495.311096,249.953568 473.549225,249.853638 451.787689,249.908157 C450.868378,249.910461 449.952667,251.347778 449.035278,252.116592 C449.035278,252.116592 449.013153,252.505493 448.684204,253.030884 C448.263367,253.874420 448.091248,254.192474 448.090942,254.510681 C448.049408,298.519501 448.005951,342.528381 448.068634,386.537048 C448.070312,387.715454 449.227966,388.892242 449.846558,390.069794 C449.799530,399.077423 452.542480,407.437195 458.681244,413.717041 C462.416504,417.538055 468.021759,420.735352 473.246277,421.684326 C494.007141,425.455200 513.889160,422.743622 531.867310,410.707336 C533.159851,409.842041 534.698181,409.344025 536.142822,408.665619 C540.565063,419.312500 524.453857,437.254242 507.092255,442.014038 C505.922485,442.365173 505.455780,442.728912 504.989075,443.092651 C504.989044,443.092651 505.002228,443.011047 504.625122,442.915222 C495.034790,443.915314 485.830841,445.767944 476.605591,445.881073 C468.403870,445.981598 460.178528,444.153717 451.963593,443.177002z"/></svg>
      <span>luca</span>
    </div>
  </div>

  <script>
    let selectedSlotId = null;
    let selectedLocationId = null;
    const hasLocations = ${hasLocations};

    function selectSlot(slotId) {
      selectedSlotId = slotId;
      // Highlight selected slot
      document.querySelectorAll('.slot-card').forEach(el => el.classList.remove('active'));
      event.currentTarget.classList.add('active');

      if (!hasLocations) {
        // No locations needed — confirm immediately
        confirmSelection();
      }
      // If locations exist, wait for location selection
    }

    function selectLocation(locationId) {
      selectedLocationId = locationId;
      // Highlight selected location
      document.querySelectorAll('.location-card').forEach(el => el.classList.remove('active'));
      event.currentTarget.classList.add('active');

      // If both selected, confirm
      if (selectedSlotId) {
        confirmSelection();
      }
    }

    async function confirmSelection() {
      if (!selectedSlotId) return;
      const msg = document.getElementById('message');
      try {
        const payload = { slotId: selectedSlotId };
        if (selectedLocationId) payload.locationId = selectedLocationId;

        const res = await fetch('/meeting/${meeting.shortId}/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          msg.className = 'success';
          msg.textContent = 'Meeting confirmed for ' + data.time + '! A calendar invite has been sent.';
          msg.style.display = 'block';
          setTimeout(() => location.reload(), 2000);
        } else {
          msg.className = 'error';
          msg.textContent = data.error || 'Something went wrong';
          msg.style.display = 'block';
        }
      } catch (e) {
        msg.className = 'error';
        msg.textContent = 'Network error. Please try again.';
        msg.style.display = 'block';
      }
    }

    async function requestMoreTimes() {
      const msg = document.getElementById('message');
      try {
        const res = await fetch('/meeting/${meeting.shortId}/more-times', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          msg.className = 'success';
          msg.textContent = 'Looking for more times... Refresh in a moment.';
          msg.style.display = 'block';
          setTimeout(() => location.reload(), 3000);
        } else {
          msg.className = 'error';
          msg.textContent = data.error || 'Something went wrong';
          msg.style.display = 'block';
        }
      } catch (e) {
        msg.className = 'error';
        msg.textContent = 'Network error. Please try again.';
        msg.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
}
