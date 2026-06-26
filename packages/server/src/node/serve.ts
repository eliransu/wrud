/**
 * Local Node entry. Constructs the real adapters (local SQLite, in-process rate limiter)
 * and serves the same buildApp() Hono app via @hono/node-server. No cloud dependency.
 *
 * Env: WRUD_DB (default ./wrud.db), WRUD_PORT (default 11190),
 *      WRUD_RATE_LIMIT (default 120), WRUD_RATE_WINDOW_MS (default 60000).
 */
import { serve } from "@hono/node-server";
import { buildApp } from "../app.js";
import { SqliteStorageAdapter } from "../storage/sqlite.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { buildSummarizer } from "../summarize/composite.js";
import { anthropicNarrator } from "../summarize/anthropic.js";
import { defaultAnalyzers } from "../insights/index.js";

/** Parse a positive-integer env var, failing fast on a misconfigured value. */
function posIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `${name} must be a positive number, got ${JSON.stringify(raw)}`,
    );
  }
  return Math.floor(n);
}

const dbPath = process.env.WRUD_DB ?? "./wrud.db";
const port = posIntEnv("WRUD_PORT", 11190);

// Insights are always on; LLM narrative is opt-in via WRUD_ANTHROPIC_KEY.
const anthropicKey = process.env.WRUD_ANTHROPIC_KEY;
const summarizer = buildSummarizer({
  analyzers: defaultAnalyzers(),
  narrator: anthropicKey ? anthropicNarrator(anthropicKey) : undefined,
});

// Browser platform origins allowed via CORS (comma-separated). Defaults cover Vite dev + preview.
if (!process.env.WRUD_CORS_ORIGIN) {
  console.warn(
    "[security] WRUD_CORS_ORIGIN not set - defaulting to localhost origins. Set it explicitly before any non-local deployment.",
  );
}
const corsOrigins = (
  process.env.WRUD_CORS_ORIGIN ??
  "http://localhost:11191,http://localhost:11192"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = buildApp({
  storage: new SqliteStorageAdapter(dbPath),
  summarizer,
  rateLimiter: new MemoryRateLimiter({
    limit: posIntEnv("WRUD_RATE_LIMIT", 120),
    windowMs: posIntEnv("WRUD_RATE_WINDOW_MS", 60000),
  }),
  corsOrigins,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`wrud server on http://localhost:${info.port} (db: ${dbPath})`);
});
