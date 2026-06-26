/**
 * The wrud contract - every entity and request/response body as a zod schema.
 * This file is the single source of truth: types are inferred from it (see index.ts)
 * and the OpenAPI document is generated from it (server/http/openapi.ts).
 */
import { z } from "zod";
import { isoString } from "./ids.js";

const unknownRecord = z.record(z.string(), z.unknown());

/* ---------- Session ---------- */
// Lifecycle: open (created at session start) -> summarizing (finalize in progress)
// -> summarized. `abandoned` for sessions that never finalize.
export const sessionStatusSchema = z.enum([
  "open",
  "summarizing",
  "summarized",
  "abandoned",
]);

export const sessionSchema = z.object({
  id: z.string(),
  apiKeyId: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().optional(),
    name: z.string().optional(),
  }),
  agent: z.object({ name: z.string(), version: z.string().optional() }),
  runtime: z.object({
    os: z.string().optional(),
    model: z.string().optional(),
    cwd: z.string().optional(),
  }),
  metadata: unknownRecord,
  status: sessionStatusSchema,
  startedAt: isoString,
  endedAt: isoString.nullable(),
  createdAt: isoString,
});
/** Public projection - omits the internal `apiKeyId` from API responses. */
export const sessionPublicSchema = sessionSchema.omit({ apiKeyId: true });

/* ---------- Event (discriminated union on `type`) ---------- */
const eventBase = {
  id: z.string(),
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  timestamp: isoString,
};

export const eventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("tool_call"),
    payload: z.object({
      name: z.string(),
      ok: z.boolean(),
      durationMs: z.number().optional(),
      inputSize: z.number().optional(),
      outputSize: z.number().optional(),
      input: z.unknown().optional(), // the actual tool input (args/command/file/diff)
      output: z.unknown().optional(), // the tool's response/result
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("model_use"),
    payload: z.object({
      model: z.string(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      task: z.string().optional(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("file_change"),
    payload: z.object({
      path: z.string(),
      op: z.enum(["create", "edit", "delete"]),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("message"),
    payload: z.object({
      role: z.enum(["user", "assistant", "system"]),
      chars: z.number().int().nonnegative(),
      text: z.string().optional(), // the actual message text
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("error"),
    payload: z.object({ message: z.string(), kind: z.string().optional() }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("custom"),
    payload: z.object({ name: z.string(), data: unknownRecord }),
  }),
]);

/* ---------- Insight (interface only in Phase 1) ---------- */
export const insightSchema = z.object({
  type: z.string(),
  severity: z.enum(["info", "warn"]),
  title: z.string(),
  detail: z.string(),
  evidence: unknownRecord,
});

/* ---------- SessionSummary ---------- */
export const summaryStatsSchema = z.object({
  durationMs: z.number(),
  eventCount: z.number().int(),
  toolCalls: z.record(z.string(), z.number().int()),
  filesTouched: z.array(z.string()),
  models: z.array(
    z.object({
      model: z.string(),
      calls: z.number().int(),
      inputTokens: z.number(),
      outputTokens: z.number(),
    }),
  ),
  errorCount: z.number().int(),
  messageCount: z.number().int(),
});

export const sessionSummarySchema = z.object({
  sessionId: z.string(),
  stats: summaryStatsSchema,
  narrative: z.string().nullable(),
  insights: z.array(insightSchema),
  summarizerVersion: z.string(),
  generatedAt: isoString,
  /** Who produced the summary - the server (receiver) or the caller (client). */
  summarizedBy: z.enum(["server", "client"]).optional(),
});

/** Body for POST /v1/sessions/:id/summarize - picks who summarizes (default server). */
export const summarizeRequestSchema = z.object({
  mode: z.enum(["server", "client"]).default("server"),
});
/** Body for PUT /v1/sessions/:id/summary - a caller-produced summary to store. */
export const storeSummaryRequestSchema = z.object({
  summary: sessionSummarySchema,
});

/* ---------- ApiKey ---------- */
export const apiKeyScopes = ["ingest", "read", "admin"] as const;
export const apiKeyScopeSchema = z.enum(apiKeyScopes);

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  hash: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  createdAt: isoString,
  lastUsedAt: isoString.nullable(),
  revokedAt: isoString.nullable(),
});
/** Public projection - never exposes `hash`. */
export const apiKeyPublicSchema = apiKeySchema.omit({ hash: true });

/* ---------- Lesson (interface only in Phase 1) ---------- */
export const lessonSchema = z.object({
  id: z.string(),
  sessionId: z.string().optional(),
  scope: z.enum(["session", "user", "org"]),
  guidance: z.string(),
  source: z.string(),
  createdAt: isoString,
});

/* ---------- Enterprise overview (Phase 4 rollup) ---------- */
export const overviewSchema = z.object({
  sessions: z.object({
    total: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
  }),
  models: z.array(
    z.object({
      model: z.string(),
      sessions: z.number().int(),
      calls: z.number().int(),
      inputTokens: z.number(),
      outputTokens: z.number(),
    }),
  ),
  insights: z.object({
    total: z.number().int(),
    byType: z.record(z.string(), z.number().int()),
  }),
  lessons: z.object({ total: z.number().int() }),
});

/* ---------- Request / response bodies ---------- */
export const createSessionRequestSchema = z.object({
  user: sessionSchema.shape.user,
  agent: sessionSchema.shape.agent,
  runtime: sessionSchema.shape.runtime.optional(),
  metadata: unknownRecord.optional(),
});
export const createSessionResponseSchema = z.object({
  sessionId: z.string(),
  startedAt: isoString,
});

export const appendEventsRequestSchema = z.object({
  events: z.array(eventSchema).min(1).max(500),
});
export const appendEventsResponseSchema = z.object({
  accepted: z.number().int(),
});

export const createKeyRequestSchema = z.object({
  name: z.string().min(1),
  scopes: z.array(apiKeyScopeSchema).min(1),
});
export const createKeyResponseSchema = z.object({
  apiKey: apiKeyPublicSchema,
  secret: z.string(),
});

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
