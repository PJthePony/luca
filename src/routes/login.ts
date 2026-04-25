import { Hono } from "hono";
import { verifySupabaseJwt, parseCookie } from "../lib/supabase-jwt.js";

export const loginRoutes = new Hono();

loginRoutes.get("/", async (c) => {
  const cookieHeader = c.req.header("cookie");
  const token = parseCookie(cookieHeader, "sb_access_token");

  if (token) {
    try {
      await verifySupabaseJwt(token);
      return c.redirect("/join");
    } catch {
      // Fall through to the family hub.
    }
  }

  return c.redirect("https://family.tanzillo.ai/?return_app=luca");
});
