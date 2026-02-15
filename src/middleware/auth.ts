import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { verifySupabaseJwt, parseCookie } from "../lib/supabase-jwt.js";

type User = typeof users.$inferSelect;

/**
 * Auth middleware that verifies the Supabase JWT from the sb_access_token cookie.
 * Falls back to the legacy luca_user cookie during migration.
 * Sets c.get('user') with the Luca user record.
 * Redirects to / if unauthenticated.
 */
export const authMiddleware = createMiddleware<{ Variables: { user: User } }>(
  async (c, next) => {
    const cookieHeader = c.req.header("cookie");

    // Try Supabase JWT cookie first
    const token = parseCookie(cookieHeader, "sb_access_token");
    if (token) {
      try {
        const payload = await verifySupabaseJwt(token);
        const user = await db.query.users.findFirst({
          where: eq(users.email, payload.email),
        });
        if (user) {
          c.set("user", user);
          return next();
        }
      } catch {
        // Token expired or invalid — fall through to legacy check
      }
    }

    // Legacy fallback: luca_user cookie
    const legacyUserId = parseCookie(cookieHeader, "luca_user");
    if (legacyUserId) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, legacyUserId),
      });
      if (user) {
        c.set("user", user);
        return next();
      }
    }

    return c.redirect("/");
  },
);
