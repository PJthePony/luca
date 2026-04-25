<script setup>
import { onMounted, ref } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { supabase } from '../lib/supabase.js';

const router = useRouter();
const route = useRoute();
const email = ref('');

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  email.value = user?.email ?? '';
});

const NAV = [
  { name: 'dashboard', label: 'Dashboard' },
  { name: 'settings', label: 'Settings' },
  { name: 'simulator', label: 'Simulator' },
];

async function signOut() {
  await supabase.auth.signOut();
  router.replace({ name: 'login' });
}
</script>

<template>
  <header class="bar">
    <div class="left">
      <a class="brand" href="https://family.tanzillo.ai">
        <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
        <span class="word">Luca</span>
      </a>
      <nav class="nav">
        <RouterLink v-for="item in NAV" :key="item.name" :to="{ name: item.name }" class="navlink" :class="{ active: route.name === item.name }">
          {{ item.label }}
        </RouterLink>
      </nav>
    </div>
    <div class="right">
      <span class="who">{{ email }}</span>
      <button class="signout" @click="signOut">Sign out</button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: saturate(140%) blur(8px);
}
.left { display: flex; align-items: center; gap: var(--space-6); }
.brand { display: flex; align-items: center; gap: var(--space-3); text-decoration: none; color: var(--text); }
.icon { width: 22px; height: 22px; color: var(--accent); display: block; }
.word { font-family: var(--font-serif); font-weight: 600; font-size: var(--step-1); letter-spacing: -0.01em; }
.nav { display: flex; gap: var(--space-2); }
.navlink {
  font-family: var(--font-sans);
  font-size: var(--step--1);
  color: var(--text-muted);
  text-decoration: none;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  transition: color var(--dur-2) var(--ease-out-expo), background var(--dur-2) var(--ease-out-expo);
}
.navlink:hover { color: var(--text); background: var(--bg-elevated); }
.navlink.active { color: var(--accent); }
.right { display: flex; align-items: center; gap: var(--space-4); }
.who { color: var(--text-muted); font-size: var(--step--1); }
.signout {
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-sans);
  font-size: var(--step--1);
  color: var(--text);
  cursor: pointer;
  transition: background var(--dur-2) var(--ease-out-expo);
}
.signout:hover { background: var(--bg-elevated); }
</style>
