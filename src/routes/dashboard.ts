import { Hono } from "hono";
import { eq, count as dbCount } from "drizzle-orm";
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
} from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { cancelMeeting, startRescheduling, proposeTimes } from "../services/meeting-machine.js";
import { sendThreadedReply } from "../services/email.js";
import { findAvailableSlots } from "../services/slot-proposer.js";
import { notifyUser } from "../services/notification.js";
import { fetchMeetingsData, fetchSettingsData, getAttendeeEmails } from "../services/queries.js";
import type { MeetingData, MeetingTypeWithLocations } from "../services/queries.js";
import type { GoogleTokens } from "../types/index.js";
import { env } from "../config.js";
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

  const meetingCards = meetingsData
    .map((d) => renderMeetingCard(d, tz))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Luca — Dashboard</title>
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
      <button class="nav-btn" onclick="openSettingsModal()">Settings</button>
      <button class="logout-btn" onclick="window.location.href='/auth/logout'">Sign out</button>
    </div>
  </header>

  <div class="container">
    <div class="page-header">
      <h1>Luca's Meetings</h1>
      <select class="filter-select" onchange="filterMeetings(this.value)">
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="confirmed">Confirmed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>

    <div id="meetingsList">
      ${meetingCards || `<div class="empty-state"><p>No meetings yet.</p><p class="text-sm">CC luca@tanzillo.ai on an email to get started.</p></div>`}
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
      cards.forEach(card => {
        const status = card.dataset.status;
        if (value === 'all') {
          card.style.display = '';
        } else if (value === 'active') {
          card.style.display = ['draft', 'proposed', 'rescheduling'].includes(status) ? '' : 'none';
        } else if (value === 'confirmed') {
          card.style.display = status === 'confirmed' ? '' : 'none';
        } else if (value === 'cancelled') {
          card.style.display = status === 'cancelled' ? '' : 'none';
        }
      });
    }

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
  </script>
</body>
</html>`;
}

function renderMeetingCard(d: MeetingData, tz: string): string {
  const m = d.meeting;
  const isCancelled = m.status === "cancelled";
  const attendees = d.participants.filter((p) => p.role !== "organizer");
  const attendeeStr = attendees.map((p) => p.name || p.email).join(", ");
  const rsvpStr = attendees.length > 0
    ? attendees.map((p) => `<span class="rsvp ${p.rsvpStatus}">${p.rsvpStatus}</span>`).join(" ")
    : "";

  // Cancelled meetings get a compact card
  if (isCancelled) {
    const dateStr = m.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
    return `
    <div class="meeting-card cancelled" data-status="cancelled">
      <div class="meeting-card-header">
        <div>
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
  if (["proposed", "rescheduling"].includes(m.status)) {
    actions.push(`<button class="action-btn nudge" onclick="nudgeMeeting('${m.id}')">Nudge</button>`);
  }
  if (["proposed", "confirmed"].includes(m.status)) {
    actions.push(`<button class="action-btn reschedule" onclick="rescheduleMeeting('${m.id}')">Reschedule</button>`);
  }
  if (m.status !== "cancelled") {
    actions.push(`<button class="action-btn cancel" onclick="cancelMeeting('${m.id}')">Cancel</button>`);
  }
  actions.push(`<button class="action-btn comms" onclick="openCommsModal('${m.id}', '${(m.title ?? "Meeting").replace(/'/g, "\\'")}')">View Comms${d.messageCount > 0 ? ` (${d.messageCount})` : ""}</button>`);

  return `
  <div class="meeting-card" data-status="${m.status}">
    <div class="meeting-card-header">
      <div class="meeting-title">${m.title ?? "Meeting"}</div>
      <span class="status-badge ${m.status}">${m.status}</span>
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
