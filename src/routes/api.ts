import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiAuthMiddleware } from "../middleware/api-auth.js";
import { fetchSettingsData } from "../services/queries.js";
import type { users } from "../db/schema.js";

type User = typeof users.$inferSelect;

export const apiRoutes = new Hono<{ Variables: { user: User } }>();

apiRoutes.use(
  "*",
  cors({
    origin: [
      "https://luca.tanzillo.ai",
      "https://family.tanzillo.ai",
      "http://localhost:5181",
      "http://localhost:5180",
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

apiRoutes.use("*", apiAuthMiddleware);

apiRoutes.get("/me", (c) => {
  const u = c.get("user");
  return c.json({
    id: u.id,
    email: u.email,
    name: u.name,
    timezone: u.timezone,
    workEmail: u.workEmail,
    hasGoogleConnection: !!u.googleTokens,
  });
});

apiRoutes.get("/settings", async (c) => {
  const user = c.get("user");
  const data = await fetchSettingsData(user.id);
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      workEmail: user.workEmail,
      hasGoogleConnection: !!user.googleTokens,
    },
    calendars: data.calendars,
    meetingTypes: data.types,
    availabilityRules: data.rules,
  });
});
