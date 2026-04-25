<script setup>
import { onMounted, ref, computed } from 'vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../lib/api.js';

const loading = ref(true);
const error = ref(null);
const data = ref(null);
const loadingMore = ref(false);

const PAGE_SIZE = 20;

const STATUS_LABELS = {
  draft: 'Draft',
  proposed: 'Proposed',
  confirmed: 'Confirmed',
  rescheduling: 'Rescheduling',
  cancelled: 'Cancelled',
};

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso).split(',')[0];
}

const counts = computed(() => {
  const c = { confirmed: 0, proposed: 0, draft: 0, rescheduling: 0, cancelled: 0 };
  if (!data.value) return c;
  for (const m of data.value.items) c[m.status] = (c[m.status] ?? 0) + 1;
  return c;
});

async function load(offset = 0) {
  try {
    const res = await api.get(`/api/meetings?limit=${PAGE_SIZE}&offset=${offset}`);
    if (offset === 0) {
      data.value = res;
    } else {
      data.value.items.push(...res.items);
      data.value.hasMore = res.hasMore;
      data.value.offset = res.offset;
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadMore() {
  loadingMore.value = true;
  await load(data.value.items.length);
}

onMounted(() => load());
</script>

<template>
  <TopBar />
  <main class="page">
    <header class="header">
      <div class="eyebrow">Dashboard</div>
      <h1 class="title">What's on the table.</h1>
    </header>

    <p v-if="loading" class="status">Loading…</p>
    <p v-else-if="error" class="status err">{{ error }}</p>

    <template v-else-if="data">
      <section v-if="data.total === 0" class="empty">
        <p>No meetings yet. Forward an email to Luca and he'll start scheduling.</p>
      </section>

      <template v-else>
        <div class="counts">
          <span><b>{{ data.total }}</b> total</span>
          <span v-if="counts.confirmed">· {{ counts.confirmed }} confirmed</span>
          <span v-if="counts.proposed">· {{ counts.proposed }} proposed</span>
          <span v-if="counts.draft">· {{ counts.draft }} draft</span>
          <span v-if="counts.rescheduling">· {{ counts.rescheduling }} rescheduling</span>
        </div>

        <ul class="list">
          <li v-for="m in data.items" :key="m.id" class="card">
            <div class="row top">
              <div class="left">
                <span class="status-pill" :data-status="m.status">{{ STATUS_LABELS[m.status] ?? m.status }}</span>
                <h2 class="subject">{{ m.subject || m.title || 'Untitled meeting' }}</h2>
              </div>
              <span class="when" :title="fmtRelative(m.updatedAt)">{{ fmtRelative(m.updatedAt) }}</span>
            </div>

            <div v-if="m.confirmedStart" class="when-box">
              <strong>{{ fmtDate(m.confirmedStart) }}</strong>
              <span class="muted"> · {{ m.durationMin }} min</span>
              <span v-if="m.location" class="muted"> · {{ m.location }}</span>
            </div>
            <div v-else-if="m.proposedSlotCount" class="muted small">
              {{ m.proposedSlotCount }} proposed slot{{ m.proposedSlotCount === 1 ? '' : 's' }}
            </div>

            <div v-if="m.participants.length" class="people">
              <span v-for="p in m.participants" :key="p.id" class="chip">
                {{ p.name || p.email }}
                <span v-if="p.role !== 'attendee'" class="role">· {{ p.role }}</span>
              </span>
            </div>

            <div class="footer-row">
              <span class="muted small">{{ m.meetingTypeName || 'No type' }}</span>
              <span v-if="m.messageCount" class="muted small">{{ m.messageCount }} message{{ m.messageCount === 1 ? '' : 's' }}</span>
            </div>
          </li>
        </ul>

        <div v-if="data.hasMore" class="more">
          <button class="btn ghost" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? 'Loading…' : 'Load more' }}
          </button>
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
.page { max-width: 760px; margin: 0 auto; padding: var(--space-7) var(--space-5) var(--space-9); }
.header { margin-bottom: var(--space-7); }
.title { font-family: var(--font-serif); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.018em; line-height: 1.1; font-size: 2rem; color: var(--text); margin: var(--space-2) 0 var(--space-3); text-wrap: balance; }
.status { color: var(--text-muted); padding: var(--space-5) 0; }
.status.err { color: var(--danger-600); }

.empty { text-align: center; padding: var(--space-9) var(--space-5); color: var(--text-muted); }

.counts { display: flex; gap: var(--space-2); font-size: var(--step--1); color: var(--text-muted); margin-bottom: var(--space-5); flex-wrap: wrap; }
.counts b { color: var(--text); font-weight: 600; }

.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-4); }

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition: border-color var(--dur-2) var(--ease-out-expo), box-shadow var(--dur-2) var(--ease-out-expo);
}
.card:hover { border-color: var(--border-strong); box-shadow: var(--shadow-hang-sm); }

.row { display: flex; }
.row.top { justify-content: space-between; align-items: flex-start; gap: var(--space-4); }
.left { display: flex; flex-direction: column; gap: var(--space-2); flex: 1; min-width: 0; }
.subject { font-family: var(--font-serif); font-size: var(--step-2); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.014em; color: var(--text); margin: 0; line-height: 1.3; }
.when { color: var(--text-muted); font-size: var(--step--1); white-space: nowrap; }

.status-pill {
  align-self: flex-start;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  color: var(--text-muted);
  background: var(--bg-elevated);
}
.status-pill[data-status="confirmed"] { color: white; background: var(--success-600); }
.status-pill[data-status="proposed"] { color: var(--accent); background: rgba(212, 36, 111, 0.08); }
.status-pill[data-status="draft"] { color: var(--text-muted); background: var(--bg-elevated); }
.status-pill[data-status="rescheduling"] { color: var(--warning-600); background: rgba(208, 104, 42, 0.10); }
.status-pill[data-status="cancelled"] { color: var(--danger-600); background: rgba(168, 58, 74, 0.10); text-decoration: line-through; }

.when-box { font-size: var(--step--1); color: var(--text); }
.muted { color: var(--text-muted); }
.small { font-size: var(--step--1); }

.people { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; font-size: 0.78rem; color: var(--text); background: var(--bg-elevated); border-radius: var(--radius-pill); }
.chip .role { color: var(--text-muted); font-size: 0.7rem; }

.footer-row { display: flex; justify-content: space-between; gap: var(--space-3); padding-top: var(--space-2); border-top: 1px solid var(--border); }

.more { display: flex; justify-content: center; padding: var(--space-6) 0; }
.btn { display: inline-flex; align-items: center; justify-content: center; padding: var(--space-3) var(--space-5); font-family: var(--font-sans); font-size: var(--step--1); font-weight: 600; border-radius: var(--radius-md); cursor: pointer; border: 1px solid transparent; transition: background var(--dur-2) var(--ease-out-expo); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.ghost { color: var(--text); background: transparent; border-color: var(--border-strong); }
.btn.ghost:hover:not(:disabled) { background: var(--bg-elevated); }
</style>
