import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, availabilityRules, meetingTypes } from "../db/schema.js";
import { env } from "../config.js";
import { fontLinks, baseStyles, landingStyles, joinStyles } from "../lib/styles.js";

export const joinRoutes = new Hono();

const DEFAULT_MEETING_TYPES = [
  { name: "Coffee", slug: "coffee", isOnline: false, defaultDuration: 60, isDefault: false },
  { name: "Video Call", slug: "video_call", isOnline: true, defaultDuration: 30, isDefault: true },
  { name: "Lunch", slug: "lunch", isOnline: false, defaultDuration: 60, isDefault: false },
  { name: "Quick Chat", slug: "quick_chat", isOnline: true, defaultDuration: 15, isDefault: false },
  { name: "Phone Call", slug: "phone_call", isOnline: true, defaultDuration: 30, isDefault: false },
  { name: "Drinks", slug: "drinks", isOnline: false, defaultDuration: 60, isDefault: false },
];

// ── Sign-up form ────────────────────────────────────────────────────────────

joinRoutes.get("/", (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Join Luca</title>
  ${fontLinks}
  <style>
    ${baseStyles}
    ${landingStyles}
    ${joinStyles}
  </style>
</head>
<body>
  <div class="container">
    <div class="logo" style="text-align:center;font-size:40px;margin-bottom:4px;">&#128197;</div>
    <h1 style="text-align:center;">Join Luca</h1>
    <p class="subtitle">Set up your AI scheduling assistant</p>
    <div class="card">
      <div class="error" id="error"></div>
      <form method="POST" action="/join">
        <label for="name">Your name</label>
        <input type="text" id="name" name="name" placeholder="Nicole Tanzillo" required />

        <label for="email">Email address</label>
        <input type="email" id="email" name="email" placeholder="nicole@example.com" required />

        <label for="timezone">Timezone</label>
        <select id="timezone" name="timezone">
          <option value="America/New_York" selected>Eastern (New York)</option>
          <option value="America/Chicago">Central (Chicago)</option>
          <option value="America/Denver">Mountain (Denver)</option>
          <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
          <option value="America/Anchorage">Alaska</option>
          <option value="Pacific/Honolulu">Hawaii</option>
          <option value="Europe/London">London (GMT)</option>
          <option value="Europe/Paris">Paris (CET)</option>
          <option value="Asia/Tokyo">Tokyo (JST)</option>
        </select>

        <button type="submit">Get Started</button>
      </form>
    </div>
    <p class="note">Next, you'll connect your Google Calendar so Luca can find open times.</p>
  </div>
</body>
</html>`);
});

// ── Create account & redirect to Google OAuth ────────────────────────────────

joinRoutes.post("/", async (c) => {
  const body = await c.req.parseBody();
  const name = (body.name as string)?.trim();
  const email = (body.email as string)?.trim().toLowerCase();
  const timezone = (body.timezone as string) || "America/New_York";

  if (!name || !email) {
    return c.text("Name and email are required", 400);
  }

  // Check if user already exists
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    // User exists — just redirect to Google OAuth (re-connect) or settings
    if (existing.googleTokens) {
      // Already fully set up, redirect to settings
      return c.redirect(`/settings/${existing.id}`);
    }
    // Needs to connect Google Calendar
    return c.redirect(`/auth/google?userId=${existing.id}`);
  }

  // Create new user
  const [user] = await db
    .insert(users)
    .values({ name, email, timezone })
    .returning();

  // Seed default availability: Mon-Fri 9am-5pm
  for (let day = 1; day <= 5; day++) {
    await db.insert(availabilityRules).values({
      userId: user.id,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "17:00",
    });
  }

  // Seed default meeting types
  for (const mt of DEFAULT_MEETING_TYPES) {
    await db
      .insert(meetingTypes)
      .values({ userId: user.id, ...mt })
      .onConflictDoNothing();
  }

  console.log(`New user signed up: ${user.name} (${user.email}) — ID: ${user.id}`);

  // Redirect to Google OAuth to connect calendar
  return c.redirect(`/auth/google?userId=${user.id}`);
});
