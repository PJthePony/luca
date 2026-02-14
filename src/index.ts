import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "./config.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { meetingRoutes } from "./routes/meetings.js";
import { authRoutes } from "./routes/auth.js";
import { settingsRoutes } from "./routes/settings.js";

const app = new Hono();

app.use(logger());

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/webhooks", webhookRoutes);
app.route("/meeting", meetingRoutes);
app.route("/auth", authRoutes);
app.route("/settings", settingsRoutes);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Luca is running on http://localhost:${info.port}`);
});

export default app;
