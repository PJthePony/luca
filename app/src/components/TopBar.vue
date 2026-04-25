<script setup>
import { useRouter, useRoute } from 'vue-router';
import { supabase } from '../lib/supabase.js';

const router = useRouter();
const route = useRoute();

async function signOut() {
  await supabase.auth.signOut();
  router.replace({ name: 'login' });
}
</script>

<template>
  <header class="app-header">
    <a class="app-header-brand" href="https://family.tanzillo.ai" aria-label="Luca">
      <span class="brand-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
      </span>
      <span class="app-name">Luca</span>
    </a>

    <nav class="app-header-nav">
      <button
        class="header-btn"
        :class="{ active: route.name === 'dashboard' }"
        aria-label="Dashboard" title="Dashboard"
        @click="router.push({ name: 'dashboard' })"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
      </button>
      <button
        class="header-btn"
        :class="{ active: route.name === 'simulator' }"
        aria-label="Simulator" title="Simulator"
        @click="router.push({ name: 'simulator' })"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6.5L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L15 8.5V2"/><path d="M7 2h10"/><path d="M7 16h10"/></svg>
      </button>
      <button
        class="header-btn"
        :class="{ active: route.name === 'settings' }"
        aria-label="Settings" title="Settings"
        @click="router.push({ name: 'settings' })"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>
      <button class="header-btn" aria-label="Sign out" title="Sign out" @click="signOut">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </nav>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: var(--sage-100);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 50;
}

.app-header::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 39px,
    rgba(20, 34, 53, 0.02) 39px,
    rgba(20, 34, 53, 0.02) 40px
  );
}

.app-header > * { position: relative; z-index: 1; }

.app-header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
  transition: color var(--dur-2) var(--ease-out-expo);
}

.app-header-brand:hover { color: var(--fuchsia-800); }

.brand-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(212, 36, 111, 0.08);
  border: 1px solid rgba(212, 36, 111, 0.15);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-name {
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variation-settings: 'opsz' 24;
  color: inherit;
}

.app-header-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--sage-50);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--dur-2) var(--ease-out-expo),
              color var(--dur-2) var(--ease-out-expo),
              border-color var(--dur-2) var(--ease-out-expo);
  -webkit-tap-highlight-color: transparent;
  padding: 0;
}

.header-btn:hover, .header-btn:active {
  color: var(--fuchsia-600);
  border-color: rgba(212, 36, 111, 0.25);
}

.header-btn.active {
  color: var(--fuchsia-600);
  border-color: rgba(212, 36, 111, 0.35);
  background: rgba(212, 36, 111, 0.06);
}

@media (max-width: 768px) {
  .app-header { padding: 14px 16px; }
  .header-btn { width: 44px; height: 44px; }
  .app-header-nav { gap: 8px; }
}
</style>
