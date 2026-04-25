import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userCalendars } from "../db/schema.js";
import { getAuthUrl, exchangeCode, listCalendars } from "../lib/google.js";
import { verifySupabaseJwt, parseCookie } from "../lib/supabase-jwt.js";
import { getGoogleTokensForUser } from "../lib/google-credentials.js";
import type { GoogleTokens } from "../types/index.js";
import { seedDefaults } from "../lib/seed-defaults.js";
import { findRetryableMeetings } from "../services/retry.js";

export const authRoutes = new Hono();

const COOKIE_OPTS = "Domain=.tanzillo.ai; Path=/; HttpOnly; Secure; SameSite=Lax";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const ALLOWED_ORIGINS = [
  "https://tessio.tanzillo.ai",
  "https://genco.tanzillo.ai",
  "https://luca.tanzillo.ai",
  "https://apollonia.tanzillo.ai",
];

function getAllowedOrigin(requestOrigin: string | undefined): string {
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  return ALLOWED_ORIGINS[0];
}

// ── Supabase Session Exchange ───────────────────────────────────────────────

/**
 * Set shared auth cookies from a Supabase session.
 * GET /auth/session?token=<jwt>&refresh=<rt>&returnTo=<url>
 *
 * Called by Tessio after magic-link login to sync the session to .tanzillo.ai cookies.
 */
authRoutes.get("/session", async (c) => {
  const token = c.req.query("token");
  const refreshToken = c.req.query("refresh");
  const returnTo = c.req.query("returnTo") || "https://tessio.tanzillo.ai/app";

  if (!token) {
    return c.text("Missing token parameter", 400);
  }

  try {
    const payload = await verifySupabaseJwt(token);

    // Find or create Luca user by email
    let user = await db.query.users.findFirst({
      where: eq(users.email, payload.email),
    });

    if (!user) {
      const name =
        (payload.userMetadata?.full_name as string) ||
        (payload.userMetadata?.name as string) ||
        payload.email.split("@")[0];

      const [newUser] = await db
        .insert(users)
        .values({
          email: payload.email,
          name,
          timezone: "America/New_York",
          supabaseId: payload.sub,
        })
        .returning();
      user = newUser;

      await seedDefaults(user.id);
      console.log(`Auto-created Luca user from Supabase: ${user.name} (${user.email})`);
    } else if (!user.supabaseId) {
      // Backfill supabaseId for existing users
      await db
        .update(users)
        .set({ supabaseId: payload.sub, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      user = { ...user, supabaseId: payload.sub };
    }

    // Sync Google tokens captured by the family hub into Luca's local users
    // table. Existing read paths keep using user.googleTokens, so this single
    // sync at login time avoids touching 13 call sites.
    const sharedTokens = await getGoogleTokensForUser({
      email: user.email,
      supabaseId: user.supabaseId,
    });
    if (sharedTokens?.refresh_token) {
      await db
        .update(users)
        .set({ googleTokens: sharedTokens, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }
  } catch (err: any) {
    console.error("Session exchange failed:", err);
    const msg = err?.code || err?.message || String(err);
    return c.text(`Session exchange failed: ${msg}`, 401);
  }

  // Set cookies on .tanzillo.ai domain
  c.header(
    "Set-Cookie",
    `sb_access_token=${token}; ${COOKIE_OPTS}; Max-Age=${COOKIE_MAX_AGE}`,
    { append: true },
  );
  if (refreshToken) {
    c.header(
      "Set-Cookie",
      `sb_refresh_token=${refreshToken}; ${COOKIE_OPTS}; Max-Age=${COOKIE_MAX_AGE}`,
      { append: true },
    );
  }

  return c.redirect(returnTo);
});

/**
 * Silently refresh the shared auth cookies.
 * POST /auth/session/refresh { token, refresh }
 *
 * Called by Tessio on TOKEN_REFRESHED events via fetch with credentials.
 */
authRoutes.options("/session/refresh", (c) => {
  c.header("Access-Control-Allow-Origin", getAllowedOrigin(c.req.header("origin")));
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Methods", "POST");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  return c.body(null, 204);
});

authRoutes.post("/session/refresh", async (c) => {
  c.header("Access-Control-Allow-Origin", getAllowedOrigin(c.req.header("origin")));
  c.header("Access-Control-Allow-Credentials", "true");

  const { token, refresh } = await c.req.json<{ token: string; refresh: string }>();

  if (!token) {
    return c.json({ error: "Missing token" }, 400);
  }

  try {
    await verifySupabaseJwt(token);
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }

  c.header(
    "Set-Cookie",
    `sb_access_token=${token}; ${COOKIE_OPTS}; Max-Age=${COOKIE_MAX_AGE}`,
    { append: true },
  );
  if (refresh) {
    c.header(
      "Set-Cookie",
      `sb_refresh_token=${refresh}; ${COOKIE_OPTS}; Max-Age=${COOKIE_MAX_AGE}`,
      { append: true },
    );
  }

  return c.json({ ok: true });
});

/**
 * Clear shared auth cookies.
 * GET /auth/logout?returnTo=<url>
 */
authRoutes.get("/logout", (c) => {
  const returnTo = c.req.query("returnTo") || "https://tessio.tanzillo.ai";
  const clearOpts = `${COOKIE_OPTS}; Max-Age=0`;

  c.header("Set-Cookie", `sb_access_token=; ${clearOpts}`, { append: true });
  c.header("Set-Cookie", `sb_refresh_token=; ${clearOpts}`, { append: true });

  return c.redirect(returnTo);
});

// ── Google OAuth ────────────────────────────────────────────────────────────

/**
 * Start Google OAuth flow.
 * GET /auth/google?userId=xxx
 */
authRoutes.get("/google", (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.text("Missing userId parameter", 400);
  }
  const url = getAuthUrl(userId);
  return c.redirect(url);
});

/**
 * Google OAuth callback.
 * GET /auth/google/callback?code=xxx&state=userId
 */
authRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const userId = c.req.query("state");

  if (!code || !userId) {
    return c.text("Missing code or state", 400);
  }

  const tokens = await exchangeCode(code);

  await db
    .update(users)
    .set({ googleTokens: tokens, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Auto-sync all user calendars (all enabled for conflict checking by default)
  try {
    const calendars = await listCalendars(tokens as GoogleTokens);

    for (const cal of calendars) {
      await db
        .insert(userCalendars)
        .values({
          userId,
          calendarId: cal.calendarId,
          summary: cal.summary,
          isPrimary: cal.isPrimary,
          checkForConflicts: true,
        })
        .onConflictDoUpdate({
          target: [userCalendars.userId, userCalendars.calendarId],
          set: {
            summary: cal.summary,
            isPrimary: cal.isPrimary,
          },
        });
    }

    console.log(`Synced ${calendars.length} calendars for user ${userId}`);
  } catch (err) {
    console.warn("Failed to sync calendars:", err);
  }

  // Check if there are meetings to retry after reconnect
  try {
    const retryable = await findRetryableMeetings(userId);
    if (retryable.length > 0) {
      return c.redirect("/settings?reconnected=true");
    }
  } catch (err) {
    console.warn("Failed to check retryable meetings:", err);
  }

  return c.redirect("/settings");
});
