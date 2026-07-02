/**
 * Session ingest + read routes. Bodies validated against shared zod schemas via
 * safeParse; the deterministic summarizer runs synchronously on summarize.
 *
 * Note: `summarize` takes no body - the SDK (and any well-behaved client) flushes
 * trailing events via POST /events immediately before calling summarize, so this route
 * summarizes the already-stored events.
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  createSessionRequestSchema,
  appendEventsRequestSchema,
  summarizeRequestSchema,
  storeSummaryRequestSchema,
  sessionPublicSchema,
  estimateCostUsd,
  newId,
  type Session,
  type SessionSummary,
  type StorageAdapter,
} from "@wrud/shared";
import type { AppEnv } from "../app.js";
import { requireScope } from "./auth-middleware.js";
import { AppError, zodIssues } from "./errors.js";
import { lessonsFromInsights } from "../analytics/lessons.js";
import { parseSessionFilter, clampLimit } from "./filter.js";

export const sessionRoutes = new Hono<AppEnv>();

const SUMMARIZE_FETCH_ALL = 1_000_000; // deliberate fetch-all cap for summarization

/** Goal #3: turn a summary's insights into durable lessons. */
async function persistLessons(
  storage: StorageAdapter,
  summary: SessionSummary,
  sid: string,
  now: string,
) {
  for (const draft of lessonsFromInsights(summary.insights, sid)) {
    await storage.saveLesson({ id: newId(), createdAt: now, ...draft });
  }
}

function parse<T extends z.ZodType>(schema: T, bodyValue: unknown): z.infer<T> {
  const r = schema.safeParse(bodyValue);
  if (!r.success)
    throw new AppError(
      400,
      "bad_request",
      "validation failed",
      zodIssues(r.error.issues),
    );
  return r.data;
}

sessionRoutes.post("/sessions", requireScope("ingest"), async (c) => {
  const { storage, clock } = c.get("deps");
  const reqBody = parse(
    createSessionRequestSchema,
    await c.req.json().catch(() => null),
  );
  const now = clock().toISOString();
  const session: Session = {
    id: newId(),
    apiKeyId: c.get("apiKeyId"),
    user: reqBody.user,
    agent: reqBody.agent,
    runtime: reqBody.runtime ?? {},
    metadata: reqBody.metadata ?? {},
    status: "open",
    startedAt: now,
    endedAt: null,
    createdAt: now,
  };
  await storage.createSession(session);
  return c.json({ sessionId: session.id, startedAt: session.startedAt }, 201);
});

sessionRoutes.post(
  "/sessions/:id/events",
  requireScope("ingest"),
  async (c) => {
    const { storage } = c.get("deps");
    const id = c.req.param("id");
    if (!(await storage.getSession(id)))
      throw new AppError(404, "not_found", "session not found");
    const { events } = parse(
      appendEventsRequestSchema,
      await c.req.json().catch(() => null),
    );
    if (events.some((e) => e.sessionId !== id))
      throw new AppError(400, "bad_request", "event sessionId mismatch");
    await storage.appendEvents(id, events);
    return c.json({ accepted: events.length }, 202);
  },
);

sessionRoutes.post(
  "/sessions/:id/summarize",
  requireScope("ingest"),
  async (c) => {
    const { storage, summarizer, clock } = c.get("deps");
    const id = c.req.param("id");
    const session = await storage.getSession(id);
    if (!session) throw new AppError(404, "not_found", "session not found");
    const { mode } = parse(
      summarizeRequestSchema,
      (await c.req.json().catch(() => ({}))) ?? {},
    );

    // Both modes move the session into the "summarizing" state first.
    await storage.setSessionStatus(id, "summarizing", null);

    if (mode === "client") {
      // The caller will summarize with its own AI and PUT the result to /summary.
      return c.json({ status: "summarizing" }, 202);
    }

    // Receiver mode: the server summarizes now.
    const { items: events } = await storage.getEvents(id, {
      limit: SUMMARIZE_FETCH_ALL,
    });
    const summary = await summarizer.summarize(session, events);
    await storage.saveSummary(summary);
    await storage.setSessionStatus(id, "summarized", clock().toISOString());
    await persistLessons(storage, summary, id, clock().toISOString());
    return c.json(summary, 200);
  },
);

// Caller-produced summary (client mode): store it, finalize the session.
sessionRoutes.put(
  "/sessions/:id/summary",
  requireScope("ingest"),
  async (c) => {
    const { storage, clock } = c.get("deps");
    const id = c.req.param("id");
    const session = await storage.getSession(id);
    if (!session) throw new AppError(404, "not_found", "session not found");
    const { summary } = parse(
      storeSummaryRequestSchema,
      await c.req.json().catch(() => null),
    );
    const finalized: SessionSummary = {
      ...summary,
      sessionId: id,
      summarizedBy: "client",
    };
    await storage.saveSummary(finalized);
    await storage.setSessionStatus(id, "summarized", clock().toISOString());
    await persistLessons(storage, finalized, id, clock().toISOString());
    return c.json(finalized, 200);
  },
);

sessionRoutes.get("/sessions", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const page = await storage.listSessions(parseSessionFilter(c.req.query()));
  // Enrich each row with its rollup (models from the facet index; tokens/events from counters).
  const stats = await storage.sessionStats(page.items.map((s) => s.id));
  // ~$ needs per-model token splits, which live on the summary. ponytail: one point-lookup
  // per row (page <= 100) is fine on local storage; counters cover single-model live sessions.
  const summaries = await Promise.all(
    page.items.map((s) => storage.getSummary(s.id)),
  );
  const items = page.items.map((s, i) => {
    const st = stats[s.id] ?? {
      events: 0,
      models: [],
      inputTokens: 0,
      outputTokens: 0,
    };
    const summary = summaries[i];
    const estCostUsd = summary
      ? estimateCostUsd(summary.stats.models)
      : st.models.length === 1
        ? estimateCostUsd([
            {
              model: st.models[0]!,
              inputTokens: st.inputTokens,
              outputTokens: st.outputTokens,
            },
          ])
        : null;
    return {
      ...sessionPublicSchema.parse(s),
      models: st.models,
      tokens: { input: st.inputTokens, output: st.outputTokens },
      events: st.events,
      estCostUsd,
      context: summary?.context ?? null,
      topic: summary?.topic ?? null,
      category: summary?.category ?? null,
    };
  });
  return c.json({ items, nextCursor: page.nextCursor }, 200);
});

sessionRoutes.get("/sessions/:id", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const session = await storage.getSession(c.req.param("id"));
  if (!session) throw new AppError(404, "not_found", "session not found");
  const summary = (await storage.getSummary(session.id)) ?? null;
  return c.json({ session: sessionPublicSchema.parse(session), summary }, 200);
});

sessionRoutes.get("/sessions/:id/events", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const id = c.req.param("id");
  if (!(await storage.getSession(id)))
    throw new AppError(404, "not_found", "session not found");
  const q = c.req.query();
  const page = await storage.getEvents(id, {
    limit: clampLimit(q.limit, 1000),
    cursor: q.cursor ?? null,
  });
  return c.json(page, 200);
});
