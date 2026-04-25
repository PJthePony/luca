<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api.js';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref(null);
const draft = ref(null);
const editing = ref(false);
const editedText = ref('');
const acting = ref(false);
const result = ref(null);

const shortCode = computed(() => String(route.params.shortCode || '').toUpperCase());

const qc = computed(() => draft.value?.qcResult ?? null);
const isSettled = computed(() => {
  if (!draft.value) return false;
  return ['sent', 'edited', 'rejected'].includes(draft.value.status);
});

onMounted(async () => {
  try {
    draft.value = await api.get(`/api/public/drafts/${shortCode.value}`);
    editedText.value = draft.value.composedText;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function approve() {
  acting.value = true;
  try {
    await api.post(`/api/public/drafts/${shortCode.value}/approve`);
    result.value = { kind: 'approved', message: 'Sent.' };
    if (draft.value) draft.value.status = 'sent';
  } catch (e) {
    alert(`Failed: ${e.message}`);
  } finally {
    acting.value = false;
  }
}

async function reject() {
  if (!confirm('Reject this draft? Luca will not send it.')) return;
  acting.value = true;
  try {
    await api.post(`/api/public/drafts/${shortCode.value}/reject`);
    result.value = { kind: 'rejected', message: 'Rejected.' };
    if (draft.value) draft.value.status = 'rejected';
  } catch (e) {
    alert(`Failed: ${e.message}`);
  } finally {
    acting.value = false;
  }
}

async function saveEdit() {
  if (!editedText.value.trim()) return alert('Draft is empty.');
  acting.value = true;
  try {
    await api.post(`/api/public/drafts/${shortCode.value}/edit`, { text: editedText.value });
    result.value = { kind: 'edited', message: 'Edited and sent.' };
    if (draft.value) draft.value.status = 'edited';
    editing.value = false;
  } catch (e) {
    alert(`Failed: ${e.message}`);
  } finally {
    acting.value = false;
  }
}
</script>

<template>
  <main class="page">
    <header class="bar">
      <a class="brand" href="https://family.tanzillo.ai">
        <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
        <span class="word">Luca</span>
      </a>
      <span class="muted small">Draft <code>{{ shortCode }}</code></span>
    </header>

    <p v-if="loading" class="status">Loading…</p>
    <p v-else-if="error" class="status err">{{ error }}</p>

    <template v-else-if="draft">
      <section class="hero">
        <div class="eyebrow">Review</div>
        <h1 class="title">{{ draft.subject }}</h1>
        <div class="meta">
          <span><strong>To</strong> {{ draft.toEmails.join(', ') }}</span>
          <span v-if="draft.bccEmails?.length"><strong>Bcc</strong> {{ draft.bccEmails.join(', ') }}</span>
          <span><strong>Intent</strong> {{ draft.intent }}</span>
        </div>
      </section>

      <p v-if="result" class="result" :data-kind="result.kind">{{ result.message }}</p>
      <p v-else-if="isSettled" class="result" :data-kind="draft.status">
        {{ draft.status === 'sent' ? 'Already sent.' : draft.status === 'edited' ? 'Already edited and sent.' : 'Already rejected.' }}
      </p>

      <section v-if="qc?.issues?.length || qc?.questions?.length || qc?.suggestions?.length" class="qc">
        <div v-if="qc.issues?.length" class="qc-block">
          <h3>Issues</h3>
          <ul><li v-for="(t, i) in qc.issues" :key="`i${i}`">{{ t }}</li></ul>
        </div>
        <div v-if="qc.questions?.length" class="qc-block">
          <h3>Questions</h3>
          <ul><li v-for="(t, i) in qc.questions" :key="`q${i}`">{{ t }}</li></ul>
        </div>
        <div v-if="qc.suggestions?.length" class="qc-block">
          <h3>Suggestions</h3>
          <ul><li v-for="(t, i) in qc.suggestions" :key="`s${i}`">{{ t }}</li></ul>
        </div>
      </section>

      <section class="draft-section">
        <pre v-if="!editing" class="body">{{ draft.editedText || draft.composedText }}</pre>
        <textarea v-else v-model="editedText" class="edit" :disabled="acting" />

        <div v-if="!isSettled" class="actions">
          <template v-if="!editing">
            <button class="btn primary" :disabled="acting" @click="approve">{{ acting ? 'Sending…' : 'Approve & send' }}</button>
            <button class="btn ghost" :disabled="acting" @click="editing = true">Edit</button>
            <button class="btn danger-ghost" :disabled="acting" @click="reject">Reject</button>
          </template>
          <template v-else>
            <button class="btn primary" :disabled="acting" @click="saveEdit">{{ acting ? 'Sending…' : 'Save edit & send' }}</button>
            <button class="btn ghost" :disabled="acting" @click="editing = false; editedText = draft.composedText">Cancel</button>
          </template>
        </div>
      </section>

      <footer class="footnote">
        <span>The Family · tanzillo.ai</span>
        <span class="sep">·</span>
        <a href="https://tanzillo.ai/privacy.html">Privacy</a>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.page { max-width: 760px; margin: 0 auto; padding: var(--space-4) var(--space-5) var(--space-9); min-height: 100dvh; display: flex; flex-direction: column; }

.bar { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) 0 var(--space-5); border-bottom: 1px solid var(--border); margin-bottom: var(--space-7); }
.brand { display: flex; align-items: center; gap: var(--space-3); text-decoration: none; color: var(--text); }
.icon { width: 22px; height: 22px; color: var(--accent); display: block; }
.word { font-family: var(--font-serif); font-weight: 600; font-size: var(--step-1); letter-spacing: -0.01em; }
.muted { color: var(--text-muted); }
.small { font-size: var(--step--1); }
.muted code { font-family: var(--font-mono); padding: 1px 6px; background: var(--bg-elevated); border-radius: var(--radius-sm); color: var(--text); font-size: 0.78rem; }

.status { color: var(--text-muted); padding: var(--space-5) 0; }
.status.err { color: var(--danger-600); }

.hero { margin-bottom: var(--space-6); }
.title { font-family: var(--font-serif); font-style: italic; font-weight: 500; font-variation-settings: 'opsz' 72; letter-spacing: -0.018em; line-height: 1.05; font-size: var(--step-3); color: var(--accent); margin: var(--space-2) 0 var(--space-4); text-wrap: balance; }
.meta { display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--step--1); color: var(--text); }
.meta strong { font-weight: 700; font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); margin-right: var(--space-2); }

.result { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-5); font-size: var(--step--1); font-weight: 600; }
.result[data-kind="approved"], .result[data-kind="sent"], .result[data-kind="edited"] { background: var(--success-100); color: var(--success-600); }
.result[data-kind="rejected"] { background: var(--danger-100); color: var(--danger-600); }

.qc { display: flex; flex-direction: column; gap: var(--space-4); margin-bottom: var(--space-5); padding: var(--space-4) var(--space-5); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.qc-block h3 { font-family: var(--font-sans); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin: 0 0 var(--space-2); }
.qc-block ul { margin: 0; padding-left: var(--space-5); font-size: var(--step--1); color: var(--text-muted); line-height: 1.6; }
.qc-block li { margin-bottom: 4px; }
.qc-block li::marker { color: var(--accent); }

.draft-section { margin-bottom: var(--space-7); }
.body { white-space: pre-wrap; font-family: var(--font-serif); font-size: var(--step-0); line-height: 1.7; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-5) var(--space-6); margin: 0 0 var(--space-5); color: var(--text); font-variation-settings: 'opsz' 16; }
.edit { width: 100%; min-height: 240px; padding: var(--space-5) var(--space-6); font-family: var(--font-serif); font-size: var(--step-0); line-height: 1.7; background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); color: var(--text); resize: vertical; margin-bottom: var(--space-5); }
.edit:focus { outline: none; border-color: var(--accent); }

.actions { display: flex; gap: var(--space-3); flex-wrap: wrap; }

.btn { display: inline-flex; align-items: center; justify-content: center; padding: var(--space-3) var(--space-5); font-family: var(--font-sans); font-size: var(--step--1); font-weight: 600; border-radius: var(--radius-md); cursor: pointer; border: 1px solid transparent; transition: background var(--dur-2) var(--ease-out-expo); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { color: white; background: var(--accent); }
.btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn.ghost { color: var(--text); background: transparent; border-color: var(--border-strong); }
.btn.ghost:hover:not(:disabled) { background: var(--bg-elevated); }
.btn.danger-ghost { color: var(--danger-600); background: transparent; border-color: rgba(168, 58, 74, 0.3); }
.btn.danger-ghost:hover:not(:disabled) { background: rgba(168, 58, 74, 0.06); }

.footnote { margin-top: auto; padding-top: var(--space-7); display: flex; justify-content: center; gap: var(--space-3); font-size: var(--step--1); color: var(--text-muted); border-top: 1px solid var(--border); }
.footnote a { color: var(--text-muted); text-decoration: none; }
.footnote a:hover { color: var(--accent); }
.sep { opacity: 0.5; }
</style>
