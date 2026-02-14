import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userCalendars } from "../db/schema.js";
import { getAuthUrl, exchangeCode, listCalendars } from "../lib/google.js";

export const authRoutes = new Hono();

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
    const calendars = await listCalendars(tokens as {
      access_token?: string | null;
      refresh_token?: string | null;
    });

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
    // Non-fatal: user can still use Luca with primary calendar only
  }

  return c.html(`
    <html>
    <body style="font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
      <div style="text-align: center;">
        <h1>Connected!</h1>
        <p>Your Google Calendar is now linked to Luca. You can close this window.</p>
      </div>
    </body>
    </html>
  `);
});
