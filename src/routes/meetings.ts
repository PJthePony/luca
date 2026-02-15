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
import { fontLinks, baseStyles, meetingStyles } from "../lib/styles.js";

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
    .container { max-width: 480px; }
  </style>
</head>
<body>
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

    <p class="powered-by">Powered by Luca</p>
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
