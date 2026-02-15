import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { seedDefaults } from "../lib/seed-defaults.js";
import { verifySupabaseJwt, parseCookie } from "../lib/supabase-jwt.js";

export const joinRoutes = new Hono();

/**
 * GET /join — Auto-create Luca user from Supabase session, then redirect to Google OAuth.
 * If not authenticated, redirect to Nexbite login.
 */
joinRoutes.get("/", async (c) => {
  const cookieHeader = c.req.header("cookie");
  const token = parseCookie(cookieHeader, "sb_access_token");

  if (!token) {
    return c.redirect("https://tasks.tanzillo.ai/login");
  }

  let payload;
  try {
    payload = await verifySupabaseJwt(token);
  } catch {
    return c.redirect("https://tasks.tanzillo.ai/login");
  }

  // Check if user already exists
  const existing = await db.query.users.findFirst({
    where: eq(users.email, payload.email),
  });

  if (existing) {
    if (existing.googleTokens) {
      return c.redirect("/settings");
    }
    // Needs to connect Google Calendar
    return c.redirect(`/auth/google?userId=${existing.id}`);
  }

  // Create new user from Supabase session
  const name =
    (payload.userMetadata?.full_name as string) ||
    (payload.userMetadata?.name as string) ||
    payload.email.split("@")[0];

  const [user] = await db
    .insert(users)
    .values({
      email: payload.email,
      name,
      timezone: "America/New_York",
      supabaseId: payload.sub,
    })
    .returning();

  await seedDefaults(user.id);

  console.log(`New user from Supabase: ${user.name} (${user.email}) — ID: ${user.id}`);

  // Redirect to Google OAuth to connect calendar
  return c.redirect(`/auth/google?userId=${user.id}`);
});
