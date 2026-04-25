import { supabase } from './supabase.js';

// Bootstrap a Supabase session from a #sso= fragment passed by the family
// hub. The hub already bridged through Luca's /auth/session, so the
// .tanzillo.ai cookies are also set; this populates Luca-app's localStorage
// session so its router guard sees the user as authenticated.
export async function bootstrapSSO() {
  const hash = window.location.hash;
  if (!hash.startsWith('#sso=')) return;

  try {
    const encoded = hash.slice('#sso='.length);
    const payload = JSON.parse(atob(decodeURIComponent(encoded)));
    if (!payload.access_token || !payload.refresh_token) return;

    await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) {
    console.error('[sso] bootstrap failed:', e);
  }
}
