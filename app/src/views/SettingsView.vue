<script setup>
import { onMounted, ref, computed } from 'vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../lib/api.js';

const loading = ref(true);
const error = ref(null);
const settings = ref(null);
const busy = ref({});

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}

const newRule = ref({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });

const profileDraft = ref({ timezone: '', workEmail: '' });
const profileDirty = computed(
  () =>
    settings.value &&
    (profileDraft.value.timezone !== settings.value.user.timezone ||
      (profileDraft.value.workEmail || '') !== (settings.value.user.workEmail || '')),
);

async function load() {
  try {
    settings.value = await api.get('/api/settings');
    profileDraft.value = {
      timezone: settings.value.user.timezone,
      workEmail: settings.value.user.workEmail || '',
    };
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function saveProfile() {
  busy.value.profile = true;
  try {
    const updated = await api.patch('/api/me', {
      timezone: profileDraft.value.timezone,
      workEmail: profileDraft.value.workEmail,
    });
    settings.value.user = updated;
  } catch (e) {
    alert(`Failed: ${e.message}`);
  } finally {
    busy.value.profile = false;
  }
}

async function refreshCalendars() {
  busy.value.calendars = true;
  try {
    await api.post('/api/settings/calendars/refresh');
    await load();
  } catch (e) {
    alert(`Failed: ${e.message}`);
  } finally {
    busy.value.calendars = false;
  }
}

async function toggleCalendar(cal) {
  busy.value[cal.id] = true;
  try {
    await api.patch(`/api/settings/calendars/${cal.id}`, {
      checkForConflicts: !cal.checkForConflicts,
    });
    cal.checkForConflicts = !cal.checkForConflicts;
  } catch (e) {
    alert(`Failed: ${e.message}`);
  } finally {
    busy.value[cal.id] = false;
  }
}

async function addRule() {
  busy.value.addRule = true;
  try {
    const created = await api.post('/api/settings/availability', { ...newRule.value, isActive: true });
    settings.value.availabilityRules.push(created);
    newRule.value = { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' };
  } catch (e) {
    alert(`Failed: ${e.message}`);
  } finally {
    busy.value.addRule = false;
  }
}

async function deleteRule(rule) {
  if (!confirm(`Remove ${DAYS[rule.dayOfWeek]} ${fmtTime(rule.startTime)}–${fmtTime(rule.endTime)}?`)) return;
  busy.value[rule.id] = true;
  try {
    await api.delete(`/api/settings/availability/${rule.id}`);
    settings.value.availabilityRules = settings.value.availabilityRules.filter((r) => r.id !== rule.id);
  } catch (e) {
    alert(`Failed: ${e.message}`);
  } finally {
    busy.value[rule.id] = false;
  }
}
</script>

<template>
  <TopBar />
  <main class="page">
    <header class="header">
      <div class="eyebrow">Settings</div>
      <h1 class="title">How Luca handles your time.</h1>
    </header>

    <p v-if="loading" class="status">Loading…</p>
    <p v-else-if="error" class="status err">{{ error }}</p>

    <template v-else-if="settings">
      <section class="block">
        <div class="block-head">
          <h2 class="h2">Account</h2>
        </div>
        <div class="card">
          <div class="row">
            <label>Time zone</label>
            <input v-model="profileDraft.timezone" type="text" placeholder="America/New_York" />
          </div>
          <div class="row">
            <label>Work email</label>
            <input v-model="profileDraft.workEmail" type="email" placeholder="optional" />
          </div>
          <div class="row footer-row">
            <span class="muted">{{ settings.user.email }} · Google {{ settings.user.hasGoogleConnection ? 'connected' : 'not connected' }}</span>
            <button class="btn primary" :disabled="!profileDirty || busy.profile" @click="saveProfile">
              {{ busy.profile ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </section>

      <section class="block">
        <div class="block-head row-head">
          <div>
            <h2 class="h2">Calendars</h2>
            <p class="sub">Toggle which Google calendars Luca treats as busy time.</p>
          </div>
          <button class="btn ghost" :disabled="busy.calendars" @click="refreshCalendars">
            {{ busy.calendars ? 'Refreshing…' : 'Refresh from Google' }}
          </button>
        </div>
        <ul v-if="settings.calendars.length" class="list">
          <li v-for="cal in settings.calendars" :key="cal.id" class="item">
            <div class="item-main">
              <span class="item-title">{{ cal.summary }}</span>
              <span v-if="cal.isPrimary" class="badge">Primary</span>
            </div>
            <button
              class="toggle"
              :class="{ on: cal.checkForConflicts }"
              :disabled="busy[cal.id]"
              :aria-pressed="cal.checkForConflicts"
              @click="toggleCalendar(cal)"
            >
              <span class="thumb" />
            </button>
          </li>
        </ul>
        <p v-else class="empty">No calendars synced yet — click Refresh.</p>
      </section>

      <section class="block">
        <div class="block-head">
          <h2 class="h2">Meeting types</h2>
          <p class="sub">Templates Luca matches to incoming requests. Editing UI lands next.</p>
        </div>
        <ul v-if="settings.meetingTypes.length" class="list">
          <li v-for="mt in settings.meetingTypes" :key="mt.id" class="item">
            <div class="item-main">
              <span class="item-title">{{ mt.name }}</span>
              <span class="badge">{{ mt.defaultDuration }} min</span>
              <span v-if="mt.isDefault" class="badge muted">Default</span>
            </div>
            <span class="item-meta">{{ mt.isOnline ? 'Online' : 'In person' }}</span>
          </li>
        </ul>
        <p v-else class="empty">No meeting types yet.</p>
      </section>

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
              <span v-if="!rule.isActive" class="badge muted">Off</span>
            </div>
            <button class="link-btn" :disabled="busy[rule.id]" @click="deleteRule(rule)">Remove</button>
          </li>
        </ul>

        <form class="add-rule" @submit.prevent="addRule">
          <select v-model.number="newRule.dayOfWeek">
            <option v-for="(d, i) in DAYS" :key="i" :value="i">{{ d }}</option>
          </select>
          <input v-model="newRule.startTime" type="time" />
          <span class="dash">–</span>
          <input v-model="newRule.endTime" type="time" />
          <button class="btn primary" type="submit" :disabled="busy.addRule">{{ busy.addRule ? 'Adding…' : 'Add' }}</button>
        </form>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page { max-width: 760px; margin: 0 auto; padding: var(--space-7) var(--space-5) var(--space-9); }
.header { margin-bottom: var(--space-7); }
.title { font-family: var(--font-serif); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.018em; line-height: 1.1; font-size: 2rem; color: var(--text); margin: var(--space-2) 0 var(--space-3); text-wrap: balance; }
.status { color: var(--text-muted); padding: var(--space-5) 0; }
.status.err { color: var(--danger-600); }

.block { margin-bottom: var(--space-7); }
.block-head { margin-bottom: var(--space-4); }
.row-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); }
.h2 { font-family: var(--font-serif); font-size: var(--step-2); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.014em; color: var(--text); margin: 0 0 var(--space-2); }
.sub { font-size: var(--step--1); color: var(--text-muted); margin: 0; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-3) var(--space-5); }
.card .row { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
.card .row:last-child { border-bottom: 0; }
.card label { width: 130px; color: var(--text-muted); font-size: var(--step--1); }
.card input, .add-rule input, .add-rule select { flex: 1; padding: var(--space-2) var(--space-3); font-family: var(--font-sans); font-size: var(--step--1); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); }
.card input:focus, .add-rule input:focus, .add-rule select:focus { outline: none; border-color: var(--accent); }
.footer-row { justify-content: space-between; }
.muted { color: var(--text-muted); font-size: var(--step--1); }

.list { list-style: none; padding: 0; margin: 0; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.item { display: flex; justify-content: space-between; align-items: center; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); gap: var(--space-4); }
.item:last-child { border-bottom: 0; }
.item-main { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.item-title { color: var(--text); font-weight: 500; }
.item-meta { color: var(--text-muted); font-size: var(--step--1); }

.badge { display: inline-flex; align-items: center; padding: 2px 8px; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); background: rgba(212, 36, 111, 0.08); border-radius: var(--radius-pill); }
.badge.muted { color: var(--text-muted); background: var(--bg-elevated); }

.empty { color: var(--text-muted); font-size: var(--step--1); padding: var(--space-4) 0; }

.btn { display: inline-flex; align-items: center; justify-content: center; padding: var(--space-2) var(--space-4); font-family: var(--font-sans); font-size: var(--step--1); font-weight: 600; border-radius: var(--radius-md); cursor: pointer; transition: background var(--dur-2) var(--ease-out-expo), border-color var(--dur-2) var(--ease-out-expo); border: 1px solid transparent; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { color: white; background: var(--accent); }
.btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn.ghost { color: var(--text); background: transparent; border-color: var(--border-strong); }
.btn.ghost:hover:not(:disabled) { background: var(--bg-elevated); }

.toggle { width: 40px; height: 22px; background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius-pill); position: relative; cursor: pointer; padding: 0; transition: background var(--dur-2) var(--ease-out-expo); }
.toggle .thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: white; border-radius: var(--radius-pill); box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: transform var(--dur-2) var(--ease-out-expo); }
.toggle.on { background: var(--accent); border-color: var(--accent); }
.toggle.on .thumb { transform: translateX(18px); }
.toggle:disabled { opacity: 0.5; cursor: not-allowed; }

.link-btn { background: none; border: 0; color: var(--text-muted); font-size: var(--step--1); cursor: pointer; padding: var(--space-2); }
.link-btn:hover:not(:disabled) { color: var(--danger-600); }

.add-rule { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-5); margin-top: var(--space-3); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.add-rule select { flex: 0 0 96px; }
.add-rule .dash { color: var(--text-muted); }
</style>
