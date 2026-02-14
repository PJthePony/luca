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
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8f9fa;
      color: #1a1a1a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      max-width: 480px;
      padding: 40px 24px;
    }
    .logo {
      font-size: 48px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .tagline {
      font-size: 18px;
      color: #666;
      margin-bottom: 32px;
    }
    .how-it-works {
      background: white;
      border-radius: 12px;
      padding: 24px;
      text-align: left;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      margin-bottom: 24px;
    }
    .how-it-works h2 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
      margin-bottom: 16px;
    }
    .step {
      display: flex;
      gap: 12px;
      margin-bottom: 14px;
    }
    .step:last-child { margin-bottom: 0; }
    .step-num {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      background: #4f46e5;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
    }
    .step p {
      font-size: 15px;
      line-height: 1.5;
      color: #333;
    }
    .email-badge {
      display: inline-block;
      background: #eef2ff;
      color: #4f46e5;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 500;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">&#128197;</div>
    <h1>Luca</h1>
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
    <a href="/join" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:white;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;margin-bottom:16px;">Get Started</a>
    <br>
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
