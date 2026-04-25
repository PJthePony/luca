<script setup>
import { onMounted, ref } from 'vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../lib/api.js';

const loading = ref(true);
const error = ref(null);
const settings = ref(null);

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}

onMounted(async () => {
  try {
    settings.value = await api.get('/api/settings');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <TopBar />
  <main class="page">
    <header class="header">
      <div class="eyebrow">Settings</div>
      <h1 class="title">How Luca handles your time.</h1>
    </header>

    <p v-if="loading" class="status">Loading…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <template v-else-if="settings">
      <!-- Account -->
      <section class="block">
        <div class="block-head">
          <h2 class="h2">Account</h2>
        </div>
        <dl class="kv">
          <div class="row"><dt>Name</dt><dd>{{ settings.user.name }}</dd></div>
          <div class="row"><dt>Email</dt><dd>{{ settings.user.email }}</dd></div>
          <div class="row"><dt>Work email</dt><dd>{{ settings.user.workEmail || '—' }}</dd></div>
          <div class="row"><dt>Time zone</dt><dd>{{ settings.user.timezone }}</dd></div>
          <div class="row"><dt>Google Calendar</dt><dd>{{ settings.user.hasGoogleConnection ? 'Connected' : 'Not connected' }}</dd></div>
        </dl>
      </section>

      <!-- Calendars -->
      <section class="block">
        <div class="block-head">
          <h2 class="h2">Calendars</h2>
          <p class="sub">Conflict-checking is on for the calendars below.</p>
        </div>
        <ul v-if="settings.calendars.length" class="list">
          <li v-for="cal in settings.calendars" :key="cal.id" class="item">
            <div class="item-main">
              <span class="item-title">{{ cal.summary }}</span>
              <span v-if="cal.isPrimary" class="badge">Primary</span>
            </div>
            <span class="item-meta">{{ cal.checkForConflicts ? 'Checking' : 'Off' }}</span>
          </li>
        </ul>
        <p v-else class="empty">No calendars synced yet.</p>
      </section>

      <!-- Meeting types -->
      <section class="block">
        <div class="block-head">
          <h2 class="h2">Meeting types</h2>
          <p class="sub">Templates Luca matches to incoming requests.</p>
        </div>
        <ul v-if="settings.meetingTypes.length" class="list">
          <li v-for="mt in settings.meetingTypes" :key="mt.id" class="item">
            <div class="item-main">
              <span class="item-title">{{ mt.name }}</span>
              <span class="badge">{{ mt.defaultDuration }} min</span>
            </div>
            <span class="item-meta">{{ mt.isOnline ? 'Online' : 'In person' }}</span>
          </li>
        </ul>
        <p v-else class="empty">No meeting types yet.</p>
      </section>

      <!-- Availability -->
      <section class="block">
        <div class="block-head">
          <h2 class="h2">Availability</h2>
          <p class="sub">When Luca is allowed to offer slots.</p>
        </div>
        <ul v-if="settings.availabilityRules.length" class="list">
          <li v-for="rule in settings.availabilityRules" :key="rule.id" class="item">
            <div class="item-main">
              <span class="item-title">{{ DAYS[rule.dayOfWeek] }}</span>
              <span class="item-meta">{{ fmtTime(rule.startTime) }} – {{ fmtTime(rule.endTime) }}</span>
            </div>
            <span v-if="!rule.isActive" class="badge muted">Off</span>
          </li>
        </ul>
        <p v-else class="empty">No availability rules yet.</p>
      </section>

      <p class="note">Mutations (add/edit/delete) are coming next; right now this view is read-only.</p>
    </template>
  </main>
</template>

<style scoped>
.page { max-width: 760px; margin: 0 auto; padding: var(--space-7) var(--space-5) var(--space-9); }
.header { margin-bottom: var(--space-7); }
.title { font-family: var(--font-serif); font-style: italic; font-weight: 500; font-variation-settings: 'opsz' 72; letter-spacing: -0.018em; line-height: 1.02; font-size: var(--step-4); color: var(--accent); margin: var(--space-2) 0 var(--space-3); text-wrap: balance; }
.status { color: var(--text-muted); padding: var(--space-5) 0; }
.status.error { color: var(--danger-600); }

.block { margin-bottom: var(--space-7); }
.block-head { margin-bottom: var(--space-4); }
.h2 { font-family: var(--font-serif); font-size: var(--step-2); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.014em; color: var(--text); margin: 0 0 var(--space-2); }
.sub { font-size: var(--step--1); color: var(--text-muted); margin: 0; }

.kv { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-3) var(--space-5); }
.kv .row { display: flex; justify-content: space-between; padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
.kv .row:last-child { border-bottom: 0; }
.kv dt { color: var(--text-muted); font-size: var(--step--1); }
.kv dd { color: var(--text); margin: 0; font-size: var(--step--1); }

.list { list-style: none; padding: 0; margin: 0; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.item { display: flex; justify-content: space-between; align-items: center; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); }
.item:last-child { border-bottom: 0; }
.item-main { display: flex; align-items: center; gap: var(--space-3); }
.item-title { color: var(--text); font-weight: 500; }
.item-meta { color: var(--text-muted); font-size: var(--step--1); }

.badge { display: inline-flex; align-items: center; padding: 2px 8px; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); background: rgba(212, 36, 111, 0.08); border-radius: var(--radius-pill); }
.badge.muted { color: var(--text-muted); background: var(--bg-elevated); }

.empty { color: var(--text-muted); font-size: var(--step--1); padding: var(--space-4) 0; }

.note { margin-top: var(--space-7); font-size: var(--step--1); color: var(--text-muted); font-style: italic; }
</style>
