import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  findDraftByShortCode,
  approveDraft,
  rejectDraft,
  editAndSendDraft,
} from "../services/draft-manager.js";

// Endpoints that authenticate via the resource itself (e.g. a draft's
// shortCode embedded in the URL the user clicked from email). Separate from
// the main /api router so they don't go through the Bearer-JWT middleware.
export const apiPublicRoutes = new Hono();

apiPublicRoutes.use(
  "*",
  cors({
    origin: [
      "https://luca.tanzillo.ai",
      "https://family.tanzillo.ai",
      "http://localhost:5181",
      "http://localhost:5180",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

apiPublicRoutes.get("/drafts/:shortCode", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const draft = await findDraftByShortCode(shortCode);
  if (!draft) return c.json({ error: "Not found" }, 404);
  return c.json(draft);
});

apiPublicRoutes.post("/drafts/:shortCode/approve", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const result = await approveDraft(shortCode);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ status: "sent" });
});

apiPublicRoutes.post("/drafts/:shortCode/reject", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const result = await rejectDraft(shortCode);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ status: "rejected" });
});

apiPublicRoutes.post("/drafts/:shortCode/edit", async (c) => {
  const shortCode = c.req.param("shortCode").toUpperCase();
  const body = await c.req.json<{ text: string }>();
  if (!body.text) return c.json({ error: "Missing text" }, 400);
  const result = await editAndSendDraft(shortCode, body.text);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ status: "edited_and_sent" });
});
