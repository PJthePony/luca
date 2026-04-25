import { createClient } from "@supabase/supabase-js";
import { env } from "../config.js";
import type { GoogleTokens } from "../types/index.js";

// Service-role client — bypasses RLS so backend code can read/write any
// user's Google tokens. Never expose this client to anything user-facing.
// Optional: if the env var isn't set (e.g. before Railway is updated), the
// helpers below no-op so Luca still boots and existing token paths still work.
const supabaseAdmin = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

interface LucaUser {
  email: string;
  supabaseId: string | null;
}

async function resolveAuthUserId(user: LucaUser): Promise<string | null> {
  if (user.supabaseId) return user.supabaseId;
  if (!supabaseAdmin) return null;

  // Fallback: look up auth.users by email. Happens for users created in
  // Luca before the family hub existed (no supabase_id wired up yet).
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error("[google-credentials] listUsers failed:", error);
    return null;
  }
  const match = data.users.find((u) => u.email?.toLowerCase() === user.email.toLowerCase());
  return match?.id ?? null;
}

export async function getGoogleTokensForUser(user: LucaUser): Promise<GoogleTokens | null> {
  if (!supabaseAdmin) return null;
  const authUserId = await resolveAuthUserId(user);
  if (!authUserId) return null;

  const { data, error } = await supabaseAdmin
    .from("google_credentials")
    .select("access_token, refresh_token")
    .eq("user_id", authUserId)
    .maybeSingle();

  if (error) {
    console.error("[google-credentials] read failed:", error);
    return null;
  }
  if (!data) return null;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  };
}

export async function setGoogleTokensForUser(
  user: LucaUser,
  tokens: GoogleTokens,
  scopes: string[] = [],
): Promise<void> {
  if (!supabaseAdmin) return;
  const authUserId = await resolveAuthUserId(user);
  if (!authUserId) {
    throw new Error(`Cannot store Google tokens: no auth.users row for ${user.email}`);
  }

  const { error } = await supabaseAdmin.from("google_credentials").upsert({
    user_id: authUserId,
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? "",
    scopes,
    google_email: user.email,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[google-credentials] write failed:", error);
    throw error;
  }
}
