import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "./config.js";
import { db } from "./db/index.js";
import { users } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { verifySupabaseJwt, parseCookie } from "./lib/supabase-jwt.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { meetingRoutes } from "./routes/meetings.js";
import { authRoutes } from "./routes/auth.js";
import { settingsRoutes } from "./routes/settings.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { joinRoutes } from "./routes/join.js";
import { fontLinks, landingDarkStyles, logoSvgDark } from "./lib/styles.js";

const app = new Hono();

app.use(logger());

app.get("/health", (c) => c.json({ status: "ok" }));

// Root route: redirect to settings if authenticated, otherwise show landing
app.get("/", async (c) => {
  const cookieHeader = c.req.header("cookie");

  // Check Supabase session cookie
  const token = parseCookie(cookieHeader, "sb_access_token");
  if (token) {
    try {
      const payload = await verifySupabaseJwt(token);
      const user = await db.query.users.findFirst({
        where: eq(users.email, payload.email),
      });
      if (user) {
        return c.redirect("/dashboard");
      }
    } catch {
      // Token invalid — fall through
    }
  }

  // Landing page for unauthenticated visitors
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luca — AI Scheduling Assistant</title>
  ${fontLinks}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1.6;
    }
    ${landingDarkStyles}
  </style>
</head>
<body>
  <!-- Ambient particles -->
  <div class="particles">
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
  </div>

  <!-- Nav -->
  <nav class="landing-nav">
    <div class="nav-logo">${logoSvgDark}</div>
    <span class="nav-brand">tanzillo.ai</span>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-content">
      <div class="hero-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
      </div>
      <h1 class="hero-headline">Luca</h1>
      <p class="hero-description">Your AI scheduling assistant.</p>
      <a href="/join" class="sign-in-btn">Sign In</a>
    </div>
  </section>

  <!-- Footer -->
  <footer class="landing-footer">
    <span class="footer-copy">&copy; 2026 tanzillo.ai</span>
    <div class="footer-links">
      <a href="https://tanzillo.ai/privacy.html">Privacy</a>
      <a href="https://tanzillo.ai/terms.html">Terms</a>
    </div>
  </footer>
</body>
</html>`);
});

app.route("/webhooks", webhookRoutes);
app.route("/meeting", meetingRoutes);
app.route("/auth", authRoutes);
app.route("/join", joinRoutes);
app.route("/settings", settingsRoutes);
app.route("/dashboard", dashboardRoutes);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Luca is running on http://localhost:${info.port}`);
});

export default app;
