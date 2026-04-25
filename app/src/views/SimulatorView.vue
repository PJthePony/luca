<script setup>
import { ref } from 'vue';
import TopBar from '../components/TopBar.vue';

const BASE = import.meta.env.VITE_LUCA_API_URL;

const form = ref({
  recipientName: '',
  recipientEmail: '',
  subject: '',
  emailBody: '',
});

const running = ref(false);
const result = ref(null);
const error = ref(null);

const replyForm = ref({ body: '' });
const replying = ref(false);

const samples = [
  {
    label: 'New meeting request',
    recipientName: 'Sam Vaughn',
    recipientEmail: 'sam@example.com',
    subject: 'Coffee next week?',
    emailBody: "Hey — would love to grab coffee next week. I'm in midtown most days. Mornings are best for me.",
  },
  {
    label: 'Reschedule existing',
    recipientName: 'Jamie Lee',
    recipientEmail: 'jamie@example.com',
    subject: 'Re: 30 min sync',
    emailBody: "Something came up Thursday — could we push to next week? Same time of day if possible.",
  },
];

function loadSample(s) {
  form.value = { ...s };
  result.value = null;
  error.value = null;
}

function reset() {
  result.value = null;
  error.value = null;
  replyForm.value = { body: '' };
}

async function run() {
  running.value = true;
  error.value = null;
  result.value = null;
  try {
    const res = await fetch(`${BASE}/simulator/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form.value),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `${res.status} ${res.statusText}`);
    result.value = json;
  } catch (e) {
    error.value = e.message;
  } finally {
    running.value = false;
  }
}

async function reply() {
  if (!result.value?.sessionId || !replyForm.value.body.trim()) return;
  replying.value = true;
  try {
    const res = await fetch(`${BASE}/simulator/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionId: result.value.sessionId, emailBody: replyForm.value.body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `${res.status} ${res.statusText}`);
    if (!result.value.replies) result.value.replies = [];
    result.value.replies.push({ inbound: replyForm.value.body, outbound: json });
    replyForm.value.body = '';
  } catch (e) {
    alert(`Reply failed: ${e.message}`);
  } finally {
    replying.value = false;
  }
}
</script>

<template>
  <TopBar />
  <main class="page">
    <header class="header">
      <div class="eyebrow">Simulator</div>
      <h1 class="title">Try it on a fake email first.</h1>
      <p class="lead">Compose a hypothetical email — Luca runs the full pipeline and shows you what he'd send back. Nothing leaves the server.</p>
    </header>

    <section class="block">
      <div class="block-head row-head">
        <h2 class="h2">Inbound email</h2>
        <div class="samples">
          <button v-for="s in samples" :key="s.label" class="btn ghost xs" @click="loadSample(s)">{{ s.label }}</button>
        </div>
      </div>
      <div class="card">
        <div class="row">
          <label>Recipient name</label>
          <input v-model="form.recipientName" type="text" placeholder="Sam Vaughn" />
        </div>
        <div class="row">
          <label>Recipient email</label>
          <input v-model="form.recipientEmail" type="email" placeholder="sam@example.com" />
        </div>
        <div class="row">
          <label>Subject</label>
          <input v-model="form.subject" type="text" placeholder="Coffee next week?" />
        </div>
        <div class="row col">
          <label>Email body</label>
          <textarea v-model="form.emailBody" rows="6" placeholder="Hey, would love to grab coffee next week..."></textarea>
        </div>
        <div class="row footer-row">
          <button class="btn ghost" :disabled="running" @click="reset">Reset</button>
          <button class="btn primary" :disabled="running || !form.emailBody" @click="run">{{ running ? 'Running pipeline…' : 'Run' }}</button>
        </div>
      </div>
    </section>

    <p v-if="error" class="status err">{{ error }}</p>

    <template v-if="result">
      <section class="block">
        <div class="block-head"><h2 class="h2">Luca's reply</h2></div>
        <pre class="body">{{ result.composedText }}</pre>
      </section>

      <section v-if="result.extracted" class="block">
        <div class="block-head"><h2 class="h2">What he understood</h2></div>
        <div class="card">
          <div class="kv-row"><span class="k">Intent</span><span class="v">{{ result.extracted.intent }}</span></div>
          <div v-if="result.extracted.meeting_details?.title" class="kv-row"><span class="k">Title</span><span class="v">{{ result.extracted.meeting_details.title }}</span></div>
          <div v-if="result.extracted.meeting_details?.duration_minutes" class="kv-row"><span class="k">Duration</span><span class="v">{{ result.extracted.meeting_details.duration_minutes }} min</span></div>
          <div v-if="result.extracted.time_preferences?.length" class="kv-row col">
            <span class="k">Time preferences</span>
            <ul class="prefs">
              <li v-for="(p, i) in result.extracted.time_preferences" :key="i">{{ JSON.stringify(p) }}</li>
            </ul>
          </div>
        </div>
      </section>

      <section v-if="result.timing" class="block">
        <div class="block-head"><h2 class="h2">Timing</h2></div>
        <div class="card">
          <div v-for="(v, k) in result.timing" :key="k" class="kv-row">
            <span class="k">{{ k }}</span><span class="v mono">{{ v }}</span>
          </div>
        </div>
      </section>

      <section class="block">
        <div class="block-head"><h2 class="h2">Reply as the recipient</h2><p class="sub">Continue the conversation — your reply goes to Luca, who responds.</p></div>
        <div v-if="result.replies?.length" class="thread">
          <div v-for="(r, i) in result.replies" :key="i" class="thread-pair">
            <div class="msg inbound"><div class="msg-from">{{ form.recipientName || form.recipientEmail }}</div><pre>{{ r.inbound }}</pre></div>
            <div class="msg outbound"><div class="msg-from">Luca</div><pre>{{ r.outbound.composedText }}</pre></div>
          </div>
        </div>
        <div class="card">
          <textarea v-model="replyForm.body" rows="4" placeholder="Type a reply as the recipient…" />
          <div class="footer-row">
            <button class="btn primary" :disabled="replying || !replyForm.body.trim()" @click="reply">{{ replying ? 'Sending…' : 'Send reply' }}</button>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page { max-width: 760px; margin: 0 auto; padding: var(--space-7) var(--space-5) var(--space-9); }
.header { margin-bottom: var(--space-7); }
.title { font-family: var(--font-serif); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.018em; line-height: 1.1; font-size: 2rem; color: var(--text); margin: var(--space-2) 0 var(--space-4); text-wrap: balance; }
.lead { margin: 0; color: var(--text-muted); font-size: var(--step--1); }
.status { color: var(--text-muted); padding: var(--space-3) 0; }
.status.err { color: var(--danger-600); }

.block { margin-bottom: var(--space-7); }
.block-head { margin-bottom: var(--space-4); }
.row-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; }
.samples { display: flex; gap: var(--space-2); }
.h2 { font-family: var(--font-serif); font-size: var(--step-2); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.014em; color: var(--text); margin: 0 0 var(--space-2); }
.sub { font-size: var(--step--1); color: var(--text-muted); margin: 0; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-3) var(--space-5); }
.card .row { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
.card .row.col { flex-direction: column; align-items: stretch; gap: var(--space-2); }
.card .row.col label { width: auto; }
.card .row:last-child { border-bottom: 0; }
.card label { width: 130px; color: var(--text-muted); font-size: var(--step--1); }
.card input, .card textarea { flex: 1; padding: var(--space-2) var(--space-3); font-family: var(--font-sans); font-size: var(--step--1); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); width: 100%; }
.card textarea { font-family: var(--font-serif); font-variation-settings: 'opsz' 16; line-height: 1.6; resize: vertical; }
.card input:focus, .card textarea:focus { outline: none; border-color: var(--accent); }
.footer-row { justify-content: flex-end; gap: var(--space-3); }

.body { white-space: pre-wrap; font-family: var(--font-serif); font-size: var(--step-0); line-height: 1.7; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-5) var(--space-6); margin: 0; color: var(--text); font-variation-settings: 'opsz' 16; }

.kv-row { display: flex; gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
.kv-row:last-child { border-bottom: 0; }
.kv-row.col { flex-direction: column; gap: var(--space-2); }
.k { width: 130px; color: var(--text-muted); font-size: var(--step--1); }
.v { color: var(--text); font-size: var(--step--1); }
.v.mono { font-family: var(--font-mono); }
.prefs { list-style: none; padding: 0; margin: 0; font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted); }
.prefs li { padding: 2px 0; }

.thread { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); }
.thread-pair { display: flex; flex-direction: column; gap: var(--space-2); }
.msg { padding: var(--space-3) var(--space-5); border-radius: var(--radius-md); border: 1px solid var(--border); }
.msg.inbound { background: var(--bg-elevated); }
.msg.outbound { background: rgba(212, 36, 111, 0.04); border-color: rgba(212, 36, 111, 0.18); }
.msg-from { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: var(--space-2); }
.msg pre { white-space: pre-wrap; font-family: var(--font-serif); font-size: var(--step--1); line-height: 1.6; margin: 0; color: var(--text); font-variation-settings: 'opsz' 16; }

.btn { display: inline-flex; align-items: center; justify-content: center; padding: var(--space-3) var(--space-5); font-family: var(--font-sans); font-size: var(--step--1); font-weight: 600; border-radius: var(--radius-md); cursor: pointer; border: 1px solid transparent; transition: background var(--dur-2) var(--ease-out-expo); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.xs { padding: 4px 10px; font-size: 0.7rem; letter-spacing: 0.04em; }
.btn.primary { color: white; background: var(--accent); }
.btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn.ghost { color: var(--text); background: transparent; border-color: var(--border-strong); }
.btn.ghost:hover:not(:disabled) { background: var(--bg-elevated); }
</style>
