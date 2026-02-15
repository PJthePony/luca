import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { eq } from "drizzle-orm";
import { env } from "./config.js";
import { db } from "./db/index.js";
import { users } from "./db/schema.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { meetingRoutes } from "./routes/meetings.js";
import { authRoutes } from "./routes/auth.js";
import { settingsRoutes } from "./routes/settings.js";
import { joinRoutes } from "./routes/join.js";
import { fontLinks, baseStyles, landingStyles, logoSvg } from "./lib/styles.js";

const app = new Hono();

app.use(logger());

app.get("/health", (c) => c.json({ status: "ok" }));

// Root route: redirect to settings if userId cookie is set, otherwise show landing
app.get("/", async (c) => {
  // Check for userId cookie
  const userId = c.req.header("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("luca_user="))
    ?.split("=")[1];

  if (userId) {
    // Verify user exists
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (user) {
      return c.redirect(`/settings/${user.id}`);
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
    ${baseStyles}
    ${landingStyles}
  </style>
</head>
<body>
  <div class="container">
    <div class="landing-brand">
      ${logoSvg}
      <span class="landing-wordmark">luca</span>
    </div>
    <p class="tagline">Your AI scheduling assistant</p>
    <div class="how-it-works">
      <h2>How it works</h2>
      <div class="step">
        <div class="step-num">1</div>
        <p>CC Luca on any email where you need to schedule a meeting</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <p>Luca checks your calendar, finds open times, and proposes options</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <p>The other person picks a time, and Luca sends the calendar invite</p>
      </div>
    </div>
    <a href="/join" class="cta-btn">Get Started</a>
    <div class="email-badge">luca@tanzillo.ai</div>
  </div>
</body>
</html>`);
});

app.route("/webhooks", webhookRoutes);
app.route("/meeting", meetingRoutes);
app.route("/auth", authRoutes);
app.route("/join", joinRoutes);
app.route("/settings", settingsRoutes);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Luca is running on http://localhost:${info.port}`);
});

export default app;
