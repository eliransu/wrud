/**
 * e2e boot script: seed a fresh admin key + one sample session (so the platform has data)
 * into a throwaway DB, write the key plaintext to .tmp-e2e/key.txt for the tests, then
 * serve with CORS open to the Vite dev origin. Seeding happens in THIS process before
 * serve(), so there's no cross-process DB race and everything exists by the health gate.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { buildApp } from "../packages/server/src/app.js";
import { SqliteStorageAdapter } from "../packages/server/src/storage/sqlite.js";
import { MemoryRateLimiter } from "../packages/server/src/ratelimit/memory.js";
import { buildSummarizer } from "../packages/server/src/summarize/composite.js";
import { defaultAnalyzers } from "../packages/server/src/insights/index.js";
import { lessonsFromInsights } from "../packages/server/src/analytics/lessons.js";
import {
  generateApiKey,
  hashApiKey,
} from "../packages/server/src/auth/keys.js";
import { newId } from "@wrud/shared";

rmSync(".tmp-e2e", { recursive: true, force: true });
mkdirSync(".tmp-e2e", { recursive: true });

const storage = new SqliteStorageAdapter(".tmp-e2e/wrud.db");
const summarizer = buildSummarizer({ analyzers: defaultAnalyzers() });

// Bootstrap admin key.
const { fullKey, prefix } = generateApiKey("local");
const adminKeyId = newId();
await storage.createApiKey({
  id: adminKeyId,
  name: "e2e-admin",
  prefix,
  hash: hashApiKey(fullKey),
  scopes: ["admin", "read", "ingest"],
  createdAt: new Date().toISOString(),
  lastUsedAt: null,
  revokedAt: null,
});
writeFileSync(".tmp-e2e/key.txt", fullKey);

// One sample session: a trivial Opus use -> ModelRightsizingAnalyzer fires -> insight + lesson.
const now = new Date().toISOString();
const sessionId = newId();
await storage.createSession({
  id: sessionId,
  apiKeyId: adminKeyId,
  user: { id: "demo-user", email: "demo@wrud.dev" },
  agent: { name: "claude-code", version: "1" },
  runtime: { os: "darwin" },
  metadata: {},
  status: "open",
  startedAt: now,
  endedAt: null,
  createdAt: now,
});
await storage.appendEvents(sessionId, [
  {
    id: newId(),
    sessionId,
    seq: 0,
    timestamp: now,
    type: "tool_call",
    payload: { name: "Edit", ok: true },
  },
  {
    id: newId(),
    sessionId,
    seq: 1,
    timestamp: now,
    type: "model_use",
    payload: {
      model: "claude-opus-4-8",
      outputTokens: 30,
      task: "rename a variable",
    },
  },
]);
const events = (await storage.getEvents(sessionId, { limit: 1000 })).items;
const summary = await summarizer.summarize(
  (await storage.getSession(sessionId))!,
  events,
);
await storage.saveSummary(summary);
await storage.setSessionStatus(sessionId, "summarized", now);
for (const draft of lessonsFromInsights(summary.insights, sessionId)) {
  await storage.saveLesson({ id: newId(), createdAt: now, ...draft });
}

const app = buildApp({
  storage,
  summarizer,
  rateLimiter: new MemoryRateLimiter({ limit: 100000, windowMs: 60000 }),
  corsOrigins: ["http://localhost:11191"],
});
serve({ fetch: app.fetch, port: Number(process.env.WRUD_PORT ?? 8790) }, (i) =>
  console.log("e2e server on", i.port),
);
