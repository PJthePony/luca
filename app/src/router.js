import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from './lib/supabase.js';

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
  { path: '/dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { requiresAuth: true } },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { requiresAuth: true } },
  { path: '/approval/:id', name: 'approval', component: () => import('./views/ApprovalView.vue'), meta: { requiresAuth: true } },
  { path: '/simulator', name: 'simulator', component: () => import('./views/SimulatorView.vue'), meta: { requiresAuth: true } },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { name: 'login' };
  return true;
});

export default router;
