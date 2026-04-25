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
import { loginRoutes } from "./routes/login.js";
import { draftApprovalRoutes } from "./routes/draft-approval.js";
import { simulatorRoutes } from "./routes/simulator.js";
import { fontLinks, landingDarkStyles, logoSvgDark, baseStyles } from "./lib/styles.js";

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

  // Marketing landing for unauthenticated visitors — matches the Vue apps'
  // "Sign in to The Family" pattern.
  const FAMILY_URL = "https://family.tanzillo.ai/?return_app=luca";
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luca — Calendar · tanzillo.ai</title>
  ${fontLinks}
  <style>
    ${baseStyles}

    /* baseStyles defines color ramps but not semantic aliases — alias here. */
    :root {
      --bg: var(--sage-200);
      --bg-card: var(--sage-50);
      --bg-elevated: var(--sage-100);
      --text: var(--navy-600);
      --text-muted: var(--navy-400);
      --accent: var(--fuchsia-600);
      --accent-hover: var(--fuchsia-800);
      --border: rgba(11, 20, 30, 0.08);
      --border-strong: rgba(11, 20, 30, 0.16);
      --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
      --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-9: 96px;
      --radius-sm: 4px; --radius-md: 6px; --radius-lg: 10px; --radius-pill: 999px;
      --step-1: clamp(1.0625rem, 1rem + 0.3vw, 1.15rem);
      --step-2: clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem);
      --step-5: clamp(2.75rem, 2rem + 3.5vw, 4.5rem);
    }
    body { background: var(--bg); color: var(--text); font-family: var(--font-sans); margin: 0; }

    .page { min-height: 100dvh; background: var(--bg); display: flex; flex-direction: column; }
    .bar { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; background: var(--bg); backdrop-filter: saturate(140%) blur(8px); }
    .brand { display: flex; align-items: center; gap: var(--space-3); text-decoration: none; color: var(--text); }
    .icon { width: 22px; height: 22px; display: block; color: var(--accent); }
    .word { font-family: var(--font-serif); font-weight: 600; font-size: var(--step-1); letter-spacing: -0.01em; }

    .hero { max-width: 720px; margin: 0 auto; padding: var(--space-9) var(--space-5) var(--space-7); text-align: center; }
    .eyebrow { font-family: var(--font-sans); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-muted); }
    .title { font-family: var(--font-serif); font-style: italic; font-size: var(--step-5); font-weight: 500; font-variation-settings: 'opsz' 72; letter-spacing: -0.018em; line-height: 1.02; color: var(--accent); margin: var(--space-3) 0 var(--space-5); text-wrap: balance; }
    .lead { font-family: var(--font-sans); font-size: var(--step-2); line-height: 1.55; color: var(--text-muted); font-weight: 400; margin: 0 auto var(--space-7); max-width: 52ch; }

    .features { max-width: 920px; margin: 0 auto; padding: 0 var(--space-5) var(--space-9); display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-6); }
    .feature { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-6); }
    .feature h3 { font-family: var(--font-serif); font-size: var(--step-2); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.014em; color: var(--text); margin: 0 0 var(--space-3); }
    .feature p { font-family: var(--font-sans); font-size: 0.875rem; color: var(--text-muted); line-height: 1.6; margin: 0; }

    .btn { display: inline-flex; align-items: center; justify-content: center; font-family: var(--font-sans); font-weight: 600; border-radius: var(--radius-md); cursor: pointer; text-decoration: none; transition: background 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid transparent; }
    .btn.primary { color: white; background: var(--accent); padding: var(--space-4) var(--space-6); font-size: 1rem; }
    .btn.primary:hover { background: var(--accent-hover); transform: translateY(-1px); }
    .btn.ghost { color: var(--text); background: transparent; border-color: var(--border-strong); font-size: 0.875rem; padding: var(--space-2) var(--space-4); }
    .btn.ghost:hover { background: var(--bg-elevated); }

    .footer { margin-top: auto; padding: var(--space-5) var(--space-5) var(--space-6); display: flex; justify-content: center; align-items: center; gap: var(--space-3); font-family: var(--font-sans); font-size: 0.8125rem; color: var(--text-muted); border-top: 1px solid var(--border); }
    .footer a { color: var(--text-muted); text-decoration: none; }
    .footer a:hover { color: var(--accent); }
    .sep { opacity: 0.5; }

    @media (max-width: 640px) { .hero { padding-top: var(--space-7); } }
  </style>
</head>
<body>
  <main class="page">
    <header class="bar">
      <a class="brand" href="https://family.tanzillo.ai">
        <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
        <span class="word">Luca</span>
      </a>
      <a class="btn ghost" href="${FAMILY_URL}">Sign in to The Family</a>
    </header>

    <section class="hero">
      <div class="eyebrow">tanzillo.ai · Calendar</div>
      <h1 class="title">Luca guards your calendar.</h1>
      <p class="lead">CC Luca on any email and he figures out when everyone's free. Your time, defended.</p>
      <a class="btn primary" href="${FAMILY_URL}">Sign in to The Family</a>
    </section>

    <section class="features">
      <article class="feature">
        <h3>Email-native scheduling</h3>
        <p>Forward or CC any email. Luca reads it, picks times, drafts the reply, and handles the back-and-forth.</p>
      </article>
      <article class="feature">
        <h3>Knows your priorities</h3>
        <p>Different rules for different people. Family always gets a slot. Cold pitches get a polite no.</p>
      </article>
      <article class="feature">
        <h3>No more "what works?"</h3>
        <p>You see the calendar event when it's confirmed. The negotiation happens without you.</p>
      </article>
    </section>

    <footer class="footer">
      <span>The Family · tanzillo.ai</span>
      <span class="sep">·</span>
      <a href="https://tanzillo.ai/terms.html">Terms</a>
      <span class="sep">·</span>
      <a href="https://tanzillo.ai/privacy.html">Privacy</a>
    </footer>
  </main>
</body>
</html>`);
});

app.route("/webhooks", webhookRoutes);
app.route("/meeting", meetingRoutes);
app.route("/auth", authRoutes);
app.route("/join", joinRoutes);
app.route("/login", loginRoutes);
app.route("/settings", settingsRoutes);
app.route("/dashboard", dashboardRoutes);
app.route("/approval", draftApprovalRoutes);
app.route("/simulator", simulatorRoutes);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Luca is running on http://localhost:${info.port}`);
});

export default app;
