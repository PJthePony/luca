import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { verifySupabaseJwt, parseCookie } from "../lib/supabase-jwt.js";

type User = typeof users.$inferSelect;

// JSON-API auth: accepts a Supabase JWT from either the Authorization: Bearer
// header (Vue app via fetch) or the sb_access_token cookie (legacy SSR
// callers). Returns 401 JSON instead of redirecting.
export const apiAuthMiddleware = createMiddleware<{ Variables: { user: User } }>(
  async (c, next) => {
    const authHeader = c.req.header("authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const cookie = parseCookie(c.req.header("cookie"), "sb_access_token");
    const token = bearer ?? cookie;

    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const payload = await verifySupabaseJwt(token);
      const user = await db.query.users.findFirst({
        where: eq(users.email, payload.email),
      });
      if (!user) {
        return c.json({ error: "User not found" }, 401);
      }
      c.set("user", user);
      return next();
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  },
);
