/**
 * Read-only analytics routes (scope: read): lessons (goal #3) and the enterprise overview
 * rollup (goal #4). Lessons are generated and stored during summarize (see routes-sessions).
 */
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { requireScope } from "./auth-middleware.js";
import { computeOverview } from "../analytics/overview.js";

export const analyticsRoutes = new Hono<AppEnv>();

/** Positive-integer limit, clamped to `max`; undefined for missing/invalid (incl. 0). */
function clampLimit(raw: string | undefined, max: number): number | undefined {
  if (!raw) return undefined;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, max);
}

analyticsRoutes.get("/lessons", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const q = c.req.query();
  const scope =
    q.scope === "session" || q.scope === "user" || q.scope === "org"
      ? q.scope
      : undefined;
  const page = await storage.listLessons({
    scope,
    sessionId:
      q.sessionId && q.sessionId.length <= 128 ? q.sessionId : undefined,
    limit: clampLimit(q.limit, 500),
    cursor: q.cursor ?? null,
  });
  return c.json(page, 200);
});

analyticsRoutes.get("/stats/overview", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  return c.json(await computeOverview(storage), 200);
});
