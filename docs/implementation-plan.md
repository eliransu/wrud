# wrud Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build wrud's local-first foundation - an API-first session recorder: a runtime-portable Hono server (default Node) backed by local SQLite, API-key auth, a deterministic summarizer, and a TypeScript SDK with a Claude Code hook adapter.

**Architecture:** A `shared` package holds zod schemas + inferred types + strategy interfaces (single source of truth). A `server` package builds a Hono app via `buildApp({ storage, summarizer, rateLimiter, clock })` (dependency injection = the portability/test seam), with `MemoryStorageAdapter` (tests) and `SqliteStorageAdapter` (default, `better-sqlite3`). A `sdk` package wraps the HTTP API and ships a `claude-code` hook adapter. No cloud dependency; `npm run serve` runs it locally.

**Tech Stack:** TypeScript (NodeNext, ESM, `.js` import specifiers), zod 4, Hono + `@hono/node-server`, `better-sqlite3`, vitest, tsx, npm workspaces. OpenAPI generated from the shared zod schemas.

**Spec:** `docs/superpowers/specs/2026-06-25-wrud-design.md`

**Conventions (from the spec):**

- ESM everywhere; relative imports use `.js` extensions (NodeNext).
- Every strategy interface ships a `Memory*` impl for tests + a real impl.
- Pure core classes (gate, rate limiter, summarizer) take an injected `clock`/inputs - no global state, no `Date.now()` inside logic.
- Heavy "why" JSDoc on each module.
- TDD: write the failing test, watch it fail, implement minimally, watch it pass, commit.

---

## File Structure

```
wrud/
  package.json                              # workspaces root, scripts, dev deps
  tsconfig.json                             # NodeNext, strict, path aliases
  vitest.config.ts                          # @wrud/* aliases, node env
  packages/
    shared/
      package.json                          # name @wrud/shared, exports ./src/index.ts
      src/
        ids.ts                              # uuid + isoString helpers
        schemas.ts                          # zod schemas for every entity + request/response
        interfaces.ts                       # StorageAdapter, Summarizer, RateLimiter, InsightAnalyzer, LessonSink, Paginated, etc.
        index.ts                            # re-exports schemas + types + interfaces
    server/
      package.json                          # name @wrud/server, scripts: serve, seed:key
      migrations/0001_init.sql              # SQLite schema
      src/
        storage/memory.ts                   # MemoryStorageAdapter
        storage/sqlite.ts                   # SqliteStorageAdapter (better-sqlite3)
        auth/keys.ts                        # generateApiKey, hashApiKey
        auth/gate.ts                        # ApiKeyGate (pure scope/revocation decision)
        ratelimit/memory.ts                 # MemoryRateLimiter (pure, clock-injected)
        summarize/deterministic.ts          # DeterministicSummarizer (pure)
        http/errors.ts                      # error helpers + AppError + error shape
        http/auth-middleware.ts             # Hono middleware: key -> gate -> ratelimit -> scope
        http/routes-sessions.ts             # ingest + read routes
        http/routes-keys.ts                 # admin key routes
        http/routes-meta.ts                 # /health, /openapi.json, /docs
        http/openapi.ts                     # build OpenAPI doc from shared schemas
        app.ts                              # buildApp({ storage, summarizer, rateLimiter, clock })
        node/serve.ts                       # Node entry: construct real deps + @hono/node-server
      scripts/seed-admin-key.ts             # bootstrap admin key into the local DB
    sdk/
      package.json                          # name @wrud/sdk, exports . and ./claude-code
      src/
        client.ts                           # createWrudClient + SessionHandle
        claude-code.ts                      # CC hook payload -> events adapter
        index.ts                            # re-exports
docs/superpowers/{specs,plans}/...
```

---

## Chunk 1: Monorepo scaffold + `shared` package

### Task 1.1: Root workspace scaffold

**Files:**

- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "wrud",
  "version": "0.1.0",
  "description": "What R U Doing - local-first AI agent session recorder (API-first SDK).",
  "license": "MIT",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "serve": "npm -w @wrud/server run serve",
    "seed:key": "npm -w @wrud/server run seed:key"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@wrud/shared": ["packages/shared/src/index.ts"],
      "@wrud/server": ["packages/server/src/app.ts"],
      "@wrud/sdk": ["packages/sdk/src/index.ts"]
    }
  },
  "include": ["packages/*/src", "packages/*/scripts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: { environment: "node", include: ["packages/**/*.test.ts"] },
  resolve: {
    alias: {
      "@wrud/shared": r("./packages/shared/src/index.ts"),
      "@wrud/sdk": r("./packages/sdk/src/index.ts"),
    },
  },
});
```

- [ ] **Step 4: Install dev deps and verify tooling**

Run: `npm install`
Expected: installs without error; `node_modules/.bin/vitest` and `tsx` exist.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "chore: monorepo workspace scaffold (npm workspaces, tsx, vitest, NodeNext)"
```

### Task 1.2: `shared` package - ids + schemas

**Files:**

- Create: `packages/shared/package.json`, `packages/shared/src/ids.ts`, `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@wrud/shared",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^4.0.0" }
}
```

Run: `npm install` (links workspace + installs zod).

- [ ] **Step 2: Write `packages/shared/src/ids.ts`**

```ts
/**
 * ID + timestamp helpers shared across packages.
 *
 * IDs are server-generated UUIDs; timestamps are ISO-8601 strings validated as
 * "parseable", not via a zod-version-specific datetime helper, so the schema stays
 * portable across zod minor versions.
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();

export const isoString = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "invalid ISO-8601 timestamp",
  });
```

- [ ] **Step 3: Write the failing test `packages/shared/src/schemas.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { eventSchema, sessionSchema, apiKeyScopes } from "./schemas.js";

describe("eventSchema", () => {
  it("accepts a valid tool_call event", () => {
    const r = eventSchema.safeParse({
      id: "e1",
      sessionId: "s1",
      seq: 0,
      timestamp: "2026-06-25T10:00:00.000Z",
      type: "tool_call",
      payload: { name: "Edit", ok: true, durationMs: 12 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const r = eventSchema.safeParse({
      id: "e1",
      sessionId: "s1",
      seq: 0,
      timestamp: "2026-06-25T10:00:00.000Z",
      type: "nope",
      payload: {},
    });
    expect(r.success).toBe(false);
  });

  it("rejects a model_use event missing model", () => {
    const r = eventSchema.safeParse({
      id: "e1",
      sessionId: "s1",
      seq: 1,
      timestamp: "2026-06-25T10:00:00.000Z",
      type: "model_use",
      payload: { outputTokens: 10 },
    });
    expect(r.success).toBe(false);
  });
});

describe("sessionSchema", () => {
  it("requires user.id and agent.name", () => {
    const ok = sessionSchema.safeParse({
      id: "s1",
      apiKeyId: "k1",
      user: { id: "u1" },
      agent: { name: "claude-code" },
      runtime: {},
      metadata: {},
      status: "open",
      startedAt: "2026-06-25T10:00:00.000Z",
      endedAt: null,
      createdAt: "2026-06-25T10:00:00.000Z",
    });
    expect(ok.success).toBe(true);
    const bad = sessionSchema.safeParse({ id: "s1" });
    expect(bad.success).toBe(false);
  });
});

describe("apiKeyScopes", () => {
  it("contains the three scopes", () => {
    expect(apiKeyScopes).toEqual(["ingest", "read", "admin"]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/shared/src/schemas.test.ts`
Expected: FAIL - `./schemas.js` cannot be resolved (module not yet created).

- [ ] **Step 5: Write `packages/shared/src/schemas.ts`**

```ts
/**
 * The wrud contract - every entity and request/response body as a zod schema.
 * This file is the single source of truth: types are inferred from it (see index.ts)
 * and the OpenAPI document is generated from it (server/http/openapi.ts).
 */
import { z } from "zod";
import { isoString } from "./ids.js";

const unknownRecord = z.record(z.string(), z.unknown());

/* ---------- Session ---------- */
export const sessionStatusSchema = z.enum(["open", "summarized", "abandoned"]);

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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/schemas.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): zod schemas + id/timestamp helpers (the wrud contract)"
```

### Task 1.3: `shared` interfaces + barrel export

**Files:**

- Create: `packages/shared/src/interfaces.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

- [ ] **Step 1: Write `packages/shared/src/interfaces.ts`**

```ts
/**
 * Strategy interfaces. Each gets a Memory* impl (tests) plus a real impl (server).
 * Storage/Summarizer/LessonSink are async so a future network backend drops in without
 * changing callers; RateLimiter is intentionally synchronous (in-process counter).
 */
import type {
  Session,
  SessionStatus,
  Event,
  SessionSummary,
  Insight,
  ApiKey,
  Lesson,
} from "./index.js";

export interface Page {
  limit?: number;
  cursor?: string | null;
}
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SessionFilter {
  user?: string;
  status?: SessionStatus;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string | null;
}

export interface StorageAdapter {
  createSession(s: Session): Promise<void>;
  getSession(id: string): Promise<Session | undefined>;
  listSessions(f: SessionFilter): Promise<Paginated<Session>>;
  setSessionStatus(
    id: string,
    status: SessionStatus,
    endedAt: string | null,
  ): Promise<void>;
  appendEvents(sessionId: string, events: Event[]): Promise<void>;
  getEvents(sessionId: string, page?: Page): Promise<Paginated<Event>>;
  saveSummary(s: SessionSummary): Promise<void>;
  getSummary(sessionId: string): Promise<SessionSummary | undefined>;
  createApiKey(k: ApiKey): Promise<void>;
  getApiKeyByHash(hash: string): Promise<ApiKey | undefined>;
  listApiKeys(): Promise<ApiKey[]>;
  revokeApiKey(id: string): Promise<void>;
  touchApiKey(id: string, at: string): Promise<void>;
}

export interface Summarizer {
  version: string;
  summarize(session: Session, events: Event[]): Promise<SessionSummary>;
}

export interface RateLimiter {
  check(key: string): { ok: boolean; retryAfterMs?: number };
}

export interface InsightAnalyzer {
  analyze(summary: SessionSummary, events: Event[]): Insight[];
}

export interface LessonSink {
  emit(lesson: Lesson): Promise<void>;
}

/** App-wide clock; production passes () => new Date(), tests pass a fixed clock. */
export type Clock = () => Date;
```

- [ ] **Step 2: Write `packages/shared/src/index.ts`**

```ts
import { z } from "zod";
import * as S from "./schemas.js";

export * from "./schemas.js";
export * from "./interfaces.js";
export { newId, isoString } from "./ids.js";

export type Session = z.infer<typeof S.sessionSchema>;
export type SessionStatus = z.infer<typeof S.sessionStatusSchema>;
export type Event = z.infer<typeof S.eventSchema>;
export type EventType = Event["type"];
export type SessionSummary = z.infer<typeof S.sessionSummarySchema>;
export type SummaryStats = z.infer<typeof S.summaryStatsSchema>;
export type Insight = z.infer<typeof S.insightSchema>;
export type ApiKey = z.infer<typeof S.apiKeySchema>;
export type ApiKeyPublic = z.infer<typeof S.apiKeyPublicSchema>;
export type ApiKeyScope = z.infer<typeof S.apiKeyScopeSchema>;
export type Lesson = z.infer<typeof S.lessonSchema>;
export type CreateSessionRequest = z.infer<typeof S.createSessionRequestSchema>;
export type CreateKeyRequest = z.infer<typeof S.createKeyRequestSchema>;
```

- [ ] **Step 3: Write the failing test `packages/shared/src/index.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { newId, isoString, apiKeyScopes } from "@wrud/shared";

describe("@wrud/shared barrel", () => {
  it("exposes newId returning a uuid-like string", () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("exposes isoString validator and scopes", () => {
    expect(isoString.safeParse("2026-06-25T10:00:00.000Z").success).toBe(true);
    expect(apiKeyScopes.length).toBe(3);
  });
});
```

- [ ] **Step 4: Run to verify it fails, then passes**

Run: `npx vitest run packages/shared/src/index.test.ts`
Expected: FAIL first (if `@wrud/shared` alias unresolved or index incomplete), then after Steps 1-2 are in place, PASS. Also run `npm run typecheck` - expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): strategy interfaces + inferred-type barrel export"
```

---

## Chunk 2: Storage adapters

### Task 2.1: `MemoryStorageAdapter`

**Files:**

- Create: `packages/server/package.json`, `packages/server/src/storage/memory.ts`
- Test: `packages/server/src/storage/memory.test.ts`

- [ ] **Step 1: Write `packages/server/package.json`**

```json
{
  "name": "@wrud/server",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/app.ts" },
  "scripts": {
    "serve": "tsx src/node/serve.ts",
    "seed:key": "tsx scripts/seed-admin-key.ts"
  },
  "dependencies": {
    "@wrud/shared": "*",
    "better-sqlite3": "^11.0.0",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "zod": "^4.0.0"
  },
  "devDependencies": { "@types/better-sqlite3": "^7.6.0" }
}
```

Run: `npm install`. Expected: `better-sqlite3` compiles its native binding without error on this machine. If it fails, STOP and surface - the SQLite adapter depends on it.

- [ ] **Step 2: Write the failing test `packages/server/src/storage/memory.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Session, Event } from "@wrud/shared";
import { MemoryStorageAdapter } from "./memory.js";

const session = (id: string): Session => ({
  id,
  apiKeyId: "k1",
  user: { id: "u1" },
  agent: { name: "claude-code" },
  runtime: {},
  metadata: {},
  status: "open",
  startedAt: "2026-06-25T10:00:00.000Z",
  endedAt: null,
  createdAt: "2026-06-25T10:00:00.000Z",
});
const ev = (seq: number): Event => ({
  id: `e${seq}`,
  sessionId: "s1",
  seq,
  timestamp: "2026-06-25T10:00:00.000Z",
  type: "tool_call",
  payload: { name: "Edit", ok: true },
});

describe("MemoryStorageAdapter", () => {
  let store: MemoryStorageAdapter;
  beforeEach(() => {
    store = new MemoryStorageAdapter();
  });

  it("creates and reads a session", async () => {
    await store.createSession(session("s1"));
    expect((await store.getSession("s1"))?.id).toBe("s1");
    expect(await store.getSession("missing")).toBeUndefined();
  });

  it("appends events idempotently on (sessionId, seq) and reads them ordered", async () => {
    await store.appendEvents("s1", [ev(1), ev(0)]);
    await store.appendEvents("s1", [ev(1)]); // duplicate seq -> no-op
    const page = await store.getEvents("s1");
    expect(page.items.map((e) => e.seq)).toEqual([0, 1]);
  });

  it("sets session status + endedAt", async () => {
    await store.createSession(session("s1"));
    await store.setSessionStatus(
      "s1",
      "summarized",
      "2026-06-25T11:00:00.000Z",
    );
    const s = await store.getSession("s1");
    expect(s?.status).toBe("summarized");
    expect(s?.endedAt).toBe("2026-06-25T11:00:00.000Z");
  });

  it("stores and reads a summary", async () => {
    const summary = {
      sessionId: "s1",
      stats: {
        durationMs: 0,
        eventCount: 0,
        toolCalls: {},
        filesTouched: [],
        models: [],
        errorCount: 0,
        messageCount: 0,
      },
      narrative: null,
      insights: [],
      summarizerVersion: "deterministic@1",
      generatedAt: "2026-06-25T11:00:00.000Z",
    };
    await store.saveSummary(summary);
    expect(await store.getSummary("s1")).toEqual(summary);
  });

  it("api keys: create, lookup by hash, list, revoke", async () => {
    const key = {
      id: "k1",
      name: "test",
      prefix: "wrud_sk_local_AB...",
      hash: "HASH",
      scopes: ["admin"] as const,
      createdAt: "2026-06-25T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    };
    await store.createApiKey({ ...key, scopes: [...key.scopes] });
    expect((await store.getApiKeyByHash("HASH"))?.id).toBe("k1");
    await store.revokeApiKey("k1");
    expect((await store.getApiKeyByHash("HASH"))?.revokedAt).not.toBeNull();
    expect((await store.listApiKeys()).length).toBe(1);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run packages/server/src/storage/memory.test.ts`
Expected: FAIL - `./memory.js` not found.

- [ ] **Step 4: Write `packages/server/src/storage/memory.ts`**

```ts
/**
 * MemoryStorageAdapter - Map-backed StorageAdapter for tests and ephemeral local runs.
 * Deep-clones on the way in/out so callers can't mutate stored records by reference.
 */
import type {
  StorageAdapter,
  Session,
  SessionStatus,
  Event,
  SessionSummary,
  ApiKey,
  SessionFilter,
  Paginated,
  Page,
} from "@wrud/shared";

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryStorageAdapter implements StorageAdapter {
  private sessions = new Map<string, Session>();
  private events = new Map<string, Map<number, Event>>(); // sessionId -> seq -> event
  private summaries = new Map<string, SessionSummary>();
  private keys = new Map<string, ApiKey>(); // id -> key

  async createSession(s: Session) {
    this.sessions.set(s.id, clone(s));
  }
  async getSession(id: string) {
    const s = this.sessions.get(id);
    return s ? clone(s) : undefined;
  }

  async listSessions(f: SessionFilter): Promise<Paginated<Session>> {
    let items = [...this.sessions.values()]
      .filter((s) => (f.user ? s.user.id === f.user : true))
      .filter((s) => (f.status ? s.status === f.status : true))
      .filter((s) => (f.from ? s.createdAt >= f.from : true))
      .filter((s) => (f.to ? s.createdAt <= f.to : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
    const limit = f.limit ?? 50;
    const start = f.cursor ? items.findIndex((s) => s.id === f.cursor) + 1 : 0;
    const slice = items.slice(start, start + limit);
    const nextCursor =
      start + limit < items.length ? slice[slice.length - 1]!.id : null;
    return { items: slice.map(clone), nextCursor };
  }

  async setSessionStatus(
    id: string,
    status: SessionStatus,
    endedAt: string | null,
  ) {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, status, endedAt });
  }

  async appendEvents(sessionId: string, events: Event[]) {
    const m = this.events.get(sessionId) ?? new Map<number, Event>();
    for (const e of events) if (!m.has(e.seq)) m.set(e.seq, clone(e)); // idempotent on seq
    this.events.set(sessionId, m);
  }

  async getEvents(sessionId: string, page?: Page): Promise<Paginated<Event>> {
    const all = [...(this.events.get(sessionId)?.values() ?? [])].sort(
      (a, b) => a.seq - b.seq,
    );
    const limit = page?.limit ?? 500;
    const start = page?.cursor
      ? all.findIndex((e) => e.id === page.cursor) + 1
      : 0;
    const slice = all.slice(start, start + limit);
    const nextCursor =
      start + limit < all.length ? slice[slice.length - 1]!.id : null;
    return { items: slice.map(clone), nextCursor };
  }

  async saveSummary(s: SessionSummary) {
    this.summaries.set(s.sessionId, clone(s));
  }
  async getSummary(sessionId: string) {
    const s = this.summaries.get(sessionId);
    return s ? clone(s) : undefined;
  }

  async createApiKey(k: ApiKey) {
    this.keys.set(k.id, clone(k));
  }
  async getApiKeyByHash(hash: string) {
    const k = [...this.keys.values()].find((x) => x.hash === hash);
    return k ? clone(k) : undefined;
  }
  async listApiKeys() {
    return [...this.keys.values()].map(clone);
  }
  async revokeApiKey(id: string) {
    const k = this.keys.get(id);
    if (k && !k.revokedAt)
      this.keys.set(id, { ...k, revokedAt: new Date().toISOString() });
  }
  async touchApiKey(id: string, at: string) {
    const k = this.keys.get(id);
    if (k) this.keys.set(id, { ...k, lastUsedAt: at });
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run packages/server/src/storage/memory.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json packages/server/src/storage/memory.ts packages/server/src/storage/memory.test.ts package-lock.json
git commit -m "feat(server): MemoryStorageAdapter + tests"
```

### Task 2.2: SQLite schema migration

**Files:**

- Create: `packages/server/migrations/0001_init.sql`

- [ ] **Step 1: Write `packages/server/migrations/0001_init.sql`**

```sql
-- wrud local SQLite schema. Nested objects are stored as JSON text columns;
-- the adapter (de)serializes them. Parameterized statements only.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  api_key_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  user_json   TEXT NOT NULL,
  agent_json  TEXT NOT NULL,
  runtime_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  status      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);

CREATE TABLE IF NOT EXISTS events (
  session_id TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  id         TEXT NOT NULL,
  timestamp  TEXT NOT NULL,
  type       TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE IF NOT EXISTS summaries (
  session_id TEXT PRIMARY KEY,
  json       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  prefix      TEXT NOT NULL,
  hash        TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(hash);
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/migrations/0001_init.sql
git commit -m "feat(server): local SQLite schema migration"
```

### Task 2.3: `SqliteStorageAdapter`

**Files:**

- Create: `packages/server/src/storage/sqlite.ts`
- Test: `packages/server/src/storage/sqlite.test.ts`

- [ ] **Step 1: Write the failing test `packages/server/src/storage/sqlite.test.ts`**

Reuse the same behavioral contract as the memory adapter against an in-memory DB.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Session, Event } from "@wrud/shared";
import { SqliteStorageAdapter } from "./sqlite.js";

const session = (id: string): Session => ({
  id,
  apiKeyId: "k1",
  user: { id: "u1", email: "u@x.io" },
  agent: { name: "claude-code", version: "1" },
  runtime: { os: "darwin" },
  metadata: { foo: 1 },
  status: "open",
  startedAt: "2026-06-25T10:00:00.000Z",
  endedAt: null,
  createdAt: "2026-06-25T10:00:00.000Z",
});
const ev = (seq: number): Event => ({
  id: `e${seq}`,
  sessionId: "s1",
  seq,
  timestamp: "2026-06-25T10:00:00.000Z",
  type: "model_use",
  payload: { model: "claude-opus-4-8", outputTokens: 10 },
});

describe("SqliteStorageAdapter", () => {
  let store: SqliteStorageAdapter;
  beforeEach(() => {
    store = new SqliteStorageAdapter(":memory:");
  });

  it("round-trips a session with nested JSON intact", async () => {
    await store.createSession(session("s1"));
    const s = await store.getSession("s1");
    expect(s?.user.email).toBe("u@x.io");
    expect(s?.metadata).toEqual({ foo: 1 });
  });

  it("appends events idempotently and reads ordered by seq", async () => {
    await store.appendEvents("s1", [ev(2), ev(0)]);
    await store.appendEvents("s1", [ev(0)]); // dup -> ignored
    const page = await store.getEvents("s1");
    expect(page.items.map((e) => e.seq)).toEqual([0, 2]);
    expect(page.items[0]!.type).toBe("model_use");
  });

  it("api key lookup by hash + revoke", async () => {
    await store.createApiKey({
      id: "k1",
      name: "n",
      prefix: "p",
      hash: "H",
      scopes: ["read"],
      createdAt: "2026-06-25T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    });
    expect((await store.getApiKeyByHash("H"))?.id).toBe("k1");
    await store.revokeApiKey("k1");
    expect((await store.getApiKeyByHash("H"))?.revokedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/server/src/storage/sqlite.test.ts`
Expected: FAIL - `./sqlite.js` not found.

- [ ] **Step 3: Write `packages/server/src/storage/sqlite.ts`**

```ts
/**
 * SqliteStorageAdapter - the default, local StorageAdapter (better-sqlite3).
 * better-sqlite3 is synchronous; the StorageAdapter interface is async, so each
 * method wraps its synchronous work in a resolved promise. Nested objects are stored
 * as JSON text and parsed back through the same shapes the schemas describe.
 *
 * Pass ":memory:" for tests, or a file path (e.g. "./wrud.db") for a persistent store.
 * Schema is applied from migrations/0001_init.sql at construction.
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  StorageAdapter,
  Session,
  SessionStatus,
  Event,
  SessionSummary,
  ApiKey,
  SessionFilter,
  Paginated,
  Page,
} from "@wrud/shared";

const MIGRATION = fileURLToPath(
  new URL("../../migrations/0001_init.sql", import.meta.url),
);

export class SqliteStorageAdapter implements StorageAdapter {
  private db: Database.Database;
  constructor(path = "./wrud.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(readFileSync(MIGRATION, "utf8"));
  }

  async createSession(s: Session) {
    this.db
      .prepare(
        `INSERT INTO sessions (id, api_key_id, user_id, user_json, agent_json, runtime_json, metadata_json, status, started_at, ended_at, created_at)
       VALUES (@id,@apiKeyId,@userId,@userJson,@agentJson,@runtimeJson,@metadataJson,@status,@startedAt,@endedAt,@createdAt)`,
      )
      .run({
        id: s.id,
        apiKeyId: s.apiKeyId,
        userId: s.user.id,
        userJson: JSON.stringify(s.user),
        agentJson: JSON.stringify(s.agent),
        runtimeJson: JSON.stringify(s.runtime),
        metadataJson: JSON.stringify(s.metadata),
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        createdAt: s.createdAt,
      });
  }

  private rowToSession = (r: any): Session => ({
    id: r.id,
    apiKeyId: r.api_key_id,
    user: JSON.parse(r.user_json),
    agent: JSON.parse(r.agent_json),
    runtime: JSON.parse(r.runtime_json),
    metadata: JSON.parse(r.metadata_json),
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    createdAt: r.created_at,
  });

  async getSession(id: string) {
    const r = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
    return r ? this.rowToSession(r) : undefined;
  }

  async listSessions(f: SessionFilter): Promise<Paginated<Session>> {
    const where: string[] = [];
    const params: any = {};
    if (f.user) {
      where.push("user_id = @user");
      params.user = f.user;
    }
    if (f.status) {
      where.push("status = @status");
      params.status = f.status;
    }
    if (f.from) {
      where.push("created_at >= @from");
      params.from = f.from;
    }
    if (f.to) {
      where.push("created_at <= @to");
      params.to = f.to;
    }
    const limit = f.limit ?? 50;
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC, id DESC`,
      )
      .all(params)
      .map(this.rowToSession);
    const start = f.cursor ? rows.findIndex((s) => s.id === f.cursor) + 1 : 0;
    const slice = rows.slice(start, start + limit);
    const nextCursor =
      start + limit < rows.length ? slice[slice.length - 1]!.id : null;
    return { items: slice, nextCursor };
  }

  async setSessionStatus(
    id: string,
    status: SessionStatus,
    endedAt: string | null,
  ) {
    this.db
      .prepare(`UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?`)
      .run(status, endedAt, id);
  }

  async appendEvents(sessionId: string, events: Event[]) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO events (session_id, seq, id, timestamp, type, payload_json)
       VALUES (?,?,?,?,?,?)`,
    );
    const tx = this.db.transaction((evs: Event[]) => {
      for (const e of evs)
        stmt.run(
          sessionId,
          e.seq,
          e.id,
          e.timestamp,
          e.type,
          JSON.stringify(e.payload),
        );
    });
    tx(events);
  }

  async getEvents(sessionId: string, page?: Page): Promise<Paginated<Event>> {
    const rows = this.db
      .prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC`)
      .all(sessionId) as any[];
    const items = rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      seq: r.seq,
      timestamp: r.timestamp,
      type: r.type,
      payload: JSON.parse(r.payload_json),
    })) as Event[];
    const limit = page?.limit ?? 500;
    const start = page?.cursor
      ? items.findIndex((e) => e.id === page.cursor) + 1
      : 0;
    const slice = items.slice(start, start + limit);
    const nextCursor =
      start + limit < items.length ? slice[slice.length - 1]!.id : null;
    return { items: slice, nextCursor };
  }

  async saveSummary(s: SessionSummary) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO summaries (session_id, json) VALUES (?, ?)`,
      )
      .run(s.sessionId, JSON.stringify(s));
  }
  async getSummary(sessionId: string) {
    const r = this.db
      .prepare(`SELECT json FROM summaries WHERE session_id = ?`)
      .get(sessionId) as any;
    return r ? (JSON.parse(r.json) as SessionSummary) : undefined;
  }

  private rowToKey = (r: any): ApiKey => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    hash: r.hash,
    scopes: JSON.parse(r.scopes_json),
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  });
  async createApiKey(k: ApiKey) {
    this.db
      .prepare(
        `INSERT INTO api_keys (id, name, prefix, hash, scopes_json, created_at, last_used_at, revoked_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        k.id,
        k.name,
        k.prefix,
        k.hash,
        JSON.stringify(k.scopes),
        k.createdAt,
        k.lastUsedAt,
        k.revokedAt,
      );
  }
  async getApiKeyByHash(hash: string) {
    const r = this.db
      .prepare(`SELECT * FROM api_keys WHERE hash = ?`)
      .get(hash);
    return r ? this.rowToKey(r) : undefined;
  }
  async listApiKeys() {
    return (
      this.db
        .prepare(`SELECT * FROM api_keys ORDER BY created_at DESC`)
        .all() as any[]
    ).map(this.rowToKey);
  }
  async revokeApiKey(id: string) {
    this.db
      .prepare(
        `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
      )
      .run(new Date().toISOString(), id);
  }
  async touchApiKey(id: string, at: string) {
    this.db
      .prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
      .run(at, id);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/server/src/storage/sqlite.test.ts`
Expected: PASS. Also `npm run typecheck` - no errors (the `any` row casts are deliberate at the DB boundary).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/storage/sqlite.ts packages/server/src/storage/sqlite.test.ts
git commit -m "feat(server): SqliteStorageAdapter (default local store) + tests"
```

---

## Chunk 3: Auth crypto, gate, rate limiter, deterministic summarizer

### Task 3.1: API key crypto

**Files:**

- Create: `packages/server/src/auth/keys.ts`
- Test: `packages/server/src/auth/keys.test.ts`

- [ ] **Step 1: Write the failing test `packages/server/src/auth/keys.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "./keys.js";

describe("api key crypto", () => {
  it("generates a wrud_sk_<env>_ key with a display prefix", () => {
    const { fullKey, prefix } = generateApiKey("local");
    expect(fullKey).toMatch(/^wrud_sk_local_[A-Za-z0-9_-]{40,}$/);
    expect(prefix.startsWith("wrud_sk_local_")).toBe(true);
    expect(prefix).not.toBe(fullKey); // truncated for display
  });
  it("hashes deterministically with sha256 hex", () => {
    expect(hashApiKey("abc")).toBe(hashApiKey("abc"));
    expect(hashApiKey("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("abc")).not.toBe(hashApiKey("abd"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/server/src/auth/keys.test.ts`
Expected: FAIL - `./keys.js` not found.

- [ ] **Step 3: Write `packages/server/src/auth/keys.ts`**

```ts
/**
 * API key generation + hashing. Only the full key is secret; we persist its SHA-256
 * hash (acceptable without a KDF because the key is 32 random bytes - high entropy)
 * plus a non-secret truncated prefix for display in lists/UI.
 */
import { randomBytes, createHash } from "node:crypto";

export type KeyEnv = "local" | "live";

export function generateApiKey(env: KeyEnv = "local"): {
  fullKey: string;
  prefix: string;
} {
  const random = randomBytes(32).toString("base64url");
  const fullKey = `wrud_sk_${env}_${random}`;
  const prefix = `${fullKey.slice(0, `wrud_sk_${env}_`.length + 4)}...`;
  return { fullKey, prefix };
}

export function hashApiKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}
```

- [ ] **Step 4: Run to verify it passes; Step 5: Commit**

Run: `npx vitest run packages/server/src/auth/keys.test.ts` -> PASS.

```bash
git add packages/server/src/auth/keys.ts packages/server/src/auth/keys.test.ts
git commit -m "feat(server): api key generation + sha256 hashing"
```

### Task 3.2: `ApiKeyGate` (pure scope/revocation decision)

**Files:**

- Create: `packages/server/src/auth/gate.ts`
- Test: `packages/server/src/auth/gate.test.ts`

- [ ] **Step 1: Write the failing test `packages/server/src/auth/gate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { ApiKey } from "@wrud/shared";
import { ApiKeyGate } from "./gate.js";

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "k1",
  name: "n",
  prefix: "p",
  hash: "H",
  scopes: ["read"],
  createdAt: "2026-06-25T10:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  ...over,
});

describe("ApiKeyGate", () => {
  const gate = new ApiKeyGate();
  it("denies when key is missing -> 401", () => {
    expect(gate.authorize(undefined, "read")).toEqual({
      ok: false,
      status: 401,
      reason: "invalid api key",
    });
  });
  it("denies a revoked key -> 401", () => {
    expect(
      gate.authorize(key({ revokedAt: "2026-06-25T11:00:00.000Z" }), "read")
        .status,
    ).toBe(401);
  });
  it("denies insufficient scope -> 403", () => {
    expect(gate.authorize(key({ scopes: ["read"] }), "admin")).toEqual({
      ok: false,
      status: 403,
      reason: "insufficient scope",
    });
  });
  it("allows when scope present", () => {
    expect(gate.authorize(key({ scopes: ["read", "admin"] }), "admin")).toEqual(
      { ok: true },
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails, then Step 3: Write `packages/server/src/auth/gate.ts`**

```ts
/**
 * ApiKeyGate - the pure authorization decision: given the looked-up key (or undefined)
 * and the scope a route requires, return allow / deny with an HTTP status. No I/O, no
 * storage, no clock - trivially unit-testable. Rate limiting is a separate concern
 * (RateLimiter); storage lookup + lastUsedAt touch happen in the middleware.
 */
import type { ApiKey, ApiKeyScope } from "@wrud/shared";

export type AuthDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403; reason: string };

export class ApiKeyGate {
  authorize(key: ApiKey | undefined, required: ApiKeyScope): AuthDecision {
    if (!key || key.revokedAt)
      return { ok: false, status: 401, reason: "invalid api key" };
    if (!key.scopes.includes(required))
      return { ok: false, status: 403, reason: "insufficient scope" };
    return { ok: true };
  }
}
```

- [ ] **Step 4: Run -> PASS; Step 5: Commit**

```bash
git add packages/server/src/auth/gate.ts packages/server/src/auth/gate.test.ts
git commit -m "feat(server): pure ApiKeyGate scope/revocation decision"
```

### Task 3.3: `MemoryRateLimiter` (pure, clock-injected)

**Files:**

- Create: `packages/server/src/ratelimit/memory.ts`
- Test: `packages/server/src/ratelimit/memory.test.ts`

- [ ] **Step 1: Write the failing test `packages/server/src/ratelimit/memory.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { MemoryRateLimiter } from "./memory.js";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit, then blocks with retryAfterMs", () => {
    let now = 0;
    const rl = new MemoryRateLimiter(
      { limit: 2, windowMs: 1000 },
      () => new Date(now),
    );
    expect(rl.check("k").ok).toBe(true);
    expect(rl.check("k").ok).toBe(true);
    const blocked = rl.check("k");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
  it("recovers after the window slides", () => {
    let now = 0;
    const rl = new MemoryRateLimiter(
      { limit: 1, windowMs: 1000 },
      () => new Date(now),
    );
    expect(rl.check("k").ok).toBe(true);
    expect(rl.check("k").ok).toBe(false);
    now = 1001;
    expect(rl.check("k").ok).toBe(true);
  });
  it("tracks keys independently", () => {
    const rl = new MemoryRateLimiter(
      { limit: 1, windowMs: 1000 },
      () => new Date(0),
    );
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("b").ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then Step 3: Write `packages/server/src/ratelimit/memory.ts`**

```ts
/**
 * MemoryRateLimiter - pure sliding-window counter with an injected clock. Correct for a
 * single-process local server; a distributed backend would be a separate RateLimiter impl.
 */
import type { RateLimiter, Clock } from "@wrud/shared";

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private cfg: RateLimitConfig,
    private clock: Clock = () => new Date(),
  ) {}

  check(key: string): { ok: boolean; retryAfterMs?: number } {
    const now = this.clock().getTime();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.cfg.windowMs,
    );
    if (recent.length >= this.cfg.limit) {
      this.hits.set(key, recent);
      const retryAfterMs = this.cfg.windowMs - (now - recent[0]!);
      return { ok: false, retryAfterMs };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true };
  }
}
```

- [ ] **Step 4: Run -> PASS; Step 5: Commit**

```bash
git add packages/server/src/ratelimit
git commit -m "feat(server): MemoryRateLimiter (pure sliding window, injected clock)"
```

### Task 3.4: `DeterministicSummarizer` (pure)

**Files:**

- Create: `packages/server/src/summarize/deterministic.ts`
- Test: `packages/server/src/summarize/deterministic.test.ts`

- [ ] **Step 1: Write the failing test `packages/server/src/summarize/deterministic.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { Session, Event } from "@wrud/shared";
import { DeterministicSummarizer } from "./deterministic.js";

const session: Session = {
  id: "s1",
  apiKeyId: "k1",
  user: { id: "u1" },
  agent: { name: "claude-code" },
  runtime: {},
  metadata: {},
  status: "open",
  startedAt: "2026-06-25T10:00:00.000Z",
  endedAt: null,
  createdAt: "2026-06-25T10:00:00.000Z",
};
const events: Event[] = [
  {
    id: "e1",
    sessionId: "s1",
    seq: 0,
    timestamp: "2026-06-25T10:00:00.000Z",
    type: "tool_call",
    payload: { name: "Edit", ok: true },
  },
  {
    id: "e2",
    sessionId: "s1",
    seq: 1,
    timestamp: "2026-06-25T10:00:05.000Z",
    type: "tool_call",
    payload: { name: "Edit", ok: true },
  },
  {
    id: "e3",
    sessionId: "s1",
    seq: 2,
    timestamp: "2026-06-25T10:00:10.000Z",
    type: "model_use",
    payload: { model: "claude-opus-4-8", inputTokens: 100, outputTokens: 50 },
  },
  {
    id: "e4",
    sessionId: "s1",
    seq: 3,
    timestamp: "2026-06-25T10:00:20.000Z",
    type: "file_change",
    payload: { path: "a.ts", op: "edit" },
  },
  {
    id: "e5",
    sessionId: "s1",
    seq: 4,
    timestamp: "2026-06-25T10:00:30.000Z",
    type: "error",
    payload: { message: "boom" },
  },
];

describe("DeterministicSummarizer", () => {
  it("folds events into deterministic stats", async () => {
    const s = await new DeterministicSummarizer(
      () => new Date("2026-06-25T11:00:00.000Z"),
    ).summarize(session, events);
    expect(s.summarizerVersion).toBe("deterministic@1");
    expect(s.narrative).toBeNull();
    expect(s.insights).toEqual([]);
    expect(s.stats.eventCount).toBe(5);
    expect(s.stats.toolCalls).toEqual({ Edit: 2 });
    expect(s.stats.filesTouched).toEqual(["a.ts"]);
    expect(s.stats.errorCount).toBe(1);
    expect(s.stats.models).toEqual([
      {
        model: "claude-opus-4-8",
        calls: 1,
        inputTokens: 100,
        outputTokens: 50,
      },
    ]);
    expect(s.stats.durationMs).toBe(30000); // first to last event timestamp
    expect(s.generatedAt).toBe("2026-06-25T11:00:00.000Z");
  });
  it("handles an empty session", async () => {
    const s = await new DeterministicSummarizer(() => new Date(0)).summarize(
      session,
      [],
    );
    expect(s.stats.eventCount).toBe(0);
    expect(s.stats.durationMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then Step 3: Write `packages/server/src/summarize/deterministic.ts`**

```ts
/**
 * DeterministicSummarizer - pure fold over a session's events into structured stats.
 * No LLM, no I/O. narrative is null and insights is [] in Phase 1; the LlmSummarizer
 * (Phase 2) wraps this and fills the narrative. Clock is injected for testable generatedAt.
 */
import type {
  Summarizer,
  Session,
  Event,
  SessionSummary,
  SummaryStats,
  Clock,
} from "@wrud/shared";

export class DeterministicSummarizer implements Summarizer {
  version = "deterministic@1";
  constructor(private clock: Clock = () => new Date()) {}

  async summarize(_session: Session, events: Event[]): Promise<SessionSummary> {
    const toolCalls: Record<string, number> = {};
    const filesTouched = new Set<string>();
    const models = new Map<
      string,
      {
        model: string;
        calls: number;
        inputTokens: number;
        outputTokens: number;
      }
    >();
    let errorCount = 0,
      messageCount = 0;

    for (const e of events) {
      switch (e.type) {
        case "tool_call":
          toolCalls[e.payload.name] = (toolCalls[e.payload.name] ?? 0) + 1;
          break;
        case "file_change":
          filesTouched.add(e.payload.path);
          break;
        case "error":
          errorCount++;
          break;
        case "message":
          messageCount++;
          break;
        case "model_use": {
          const m = models.get(e.payload.model) ?? {
            model: e.payload.model,
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
          };
          m.calls++;
          m.inputTokens += e.payload.inputTokens ?? 0;
          m.outputTokens += e.payload.outputTokens ?? 0;
          models.set(e.payload.model, m);
          break;
        }
      }
    }

    const times = events
      .map((e) => Date.parse(e.timestamp))
      .sort((a, b) => a - b);
    const durationMs =
      times.length >= 2 ? times[times.length - 1]! - times[0]! : 0;

    const stats: SummaryStats = {
      durationMs,
      eventCount: events.length,
      toolCalls,
      filesTouched: [...filesTouched],
      models: [...models.values()],
      errorCount,
      messageCount,
    };
    return {
      sessionId: _session.id,
      stats,
      narrative: null,
      insights: [],
      summarizerVersion: this.version,
      generatedAt: this.clock().toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run -> PASS; Step 5: Commit**

```bash
git add packages/server/src/summarize
git commit -m "feat(server): DeterministicSummarizer (pure event fold) + golden tests"
```

---

## Chunk 4: HTTP server (buildApp, auth middleware, routes, OpenAPI)

### Task 4.1: Error helpers

**Files:**

- Create: `packages/server/src/http/errors.ts`
- Test: `packages/server/src/http/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { AppError, errorBody } from "./errors.js";

describe("errors", () => {
  it("AppError carries status + code", () => {
    const e = new AppError(404, "not_found", "nope");
    expect(e.status).toBe(404);
    expect(errorBody(e)).toEqual({
      error: { code: "not_found", message: "nope", details: undefined },
    });
  });
});
```

- [ ] **Step 2: Run (fail), Step 3: Write `packages/server/src/http/errors.ts`**

```ts
/** Structured error shape shared by every route. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const errorBody = (e: AppError) => ({
  error: { code: e.code, message: e.message, details: e.details },
});
```

- [ ] **Step 4: Run (PASS), Step 5: Commit**

```bash
git add packages/server/src/http/errors.ts packages/server/src/http/errors.test.ts
git commit -m "feat(server): structured AppError + error body"
```

### Task 4.2: `buildApp` skeleton + meta routes + error handling

**Files:**

- Create: `packages/server/src/http/routes-meta.ts`, `packages/server/src/http/openapi.ts`, `packages/server/src/app.ts`
- Test: `packages/server/src/app.test.ts`

> **OpenAPI tooling decision (resolves spec advisory):** Use plain **Hono** for routing and validate request bodies by calling the shared zod schemas' `.safeParse()` inside handlers (no validator-middleware version coupling). Generate the OpenAPI document with **`@asteasolutions/zod-to-openapi`** from the same shared schemas. If, at install time, that library is not compatible with the installed zod 4, fall back to serving a hand-built OpenAPI 3.1 object that references the same schema names (the route table is small and fixed). Either way the contract derives from `shared`.

- [ ] **Step 1: Add deps**

Run: `npm -w @wrud/server install @asteasolutions/zod-to-openapi`
If it errors on zod 4 peer mismatch, note it and use the hand-built fallback in `openapi.ts` (Step 4).

- [ ] **Step 2: Write the failing test `packages/server/src/app.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { MemoryRateLimiter } from "./ratelimit/memory.js";
import { DeterministicSummarizer } from "./summarize/deterministic.js";

const makeApp = () =>
  buildApp({
    storage: new MemoryStorageAdapter(),
    summarizer: new DeterministicSummarizer(
      () => new Date("2026-06-25T11:00:00.000Z"),
    ),
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date("2026-06-25T10:00:00.000Z"),
  });

describe("meta routes", () => {
  it("GET /health returns ok", async () => {
    const res = await makeApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("GET /openapi.json returns an openapi document", async () => {
    const res = await makeApp().request("/openapi.json");
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toMatch(/^3\./);
  });
});
```

- [ ] **Step 3: Write `packages/server/src/http/routes-meta.ts`**

```ts
import { Hono } from "hono";
import { buildOpenApiDoc } from "./openapi.js";

export const metaRoutes = new Hono();
metaRoutes.get("/health", (c) => c.json({ ok: true }));
metaRoutes.get("/openapi.json", (c) => c.json(buildOpenApiDoc()));
metaRoutes.get("/docs", (c) =>
  c.html(`<!doctype html><html><head><meta charset="utf-8"><title>wrud API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css"></head>
<body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#ui" });</script></body></html>`),
);
```

- [ ] **Step 4: Write `packages/server/src/http/openapi.ts`**

```ts
/**
 * OpenAPI 3.1 document built from the shared zod schemas. Primary path uses
 * @asteasolutions/zod-to-openapi; if unavailable for the installed zod, this file is the
 * single place to swap to a hand-built document - the route table is small and fixed.
 */
import {
  createSessionRequestSchema,
  createSessionResponseSchema,
  appendEventsRequestSchema,
  appendEventsResponseSchema,
  sessionSchema,
  sessionSummarySchema,
  createKeyRequestSchema,
  createKeyResponseSchema,
  apiKeyPublicSchema,
  errorSchema,
} from "@wrud/shared";
import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export function buildOpenApiDoc() {
  const reg = new OpenAPIRegistry();
  const bearer = reg.registerComponent("securitySchemes", "ApiKey", {
    type: "http",
    scheme: "bearer",
  });
  const json = (schema: any) => ({
    content: { "application/json": { schema } },
  });

  reg.registerPath({
    method: "post",
    path: "/v1/sessions",
    security: [{ [bearer.name]: [] }],
    request: { body: json(createSessionRequestSchema) },
    responses: {
      201: { description: "created", ...json(createSessionResponseSchema) },
      400: { description: "bad request", ...json(errorSchema) },
    },
  });
  reg.registerPath({
    method: "post",
    path: "/v1/sessions/{id}/events",
    security: [{ [bearer.name]: [] }],
    request: { body: json(appendEventsRequestSchema) },
    responses: {
      202: { description: "accepted", ...json(appendEventsResponseSchema) },
    },
  });
  reg.registerPath({
    method: "post",
    path: "/v1/sessions/{id}/summarize",
    security: [{ [bearer.name]: [] }],
    responses: {
      200: { description: "summary", ...json(sessionSummarySchema) },
    },
  });
  reg.registerPath({
    method: "get",
    path: "/v1/sessions",
    security: [{ [bearer.name]: [] }],
    responses: {
      200: {
        description: "list",
        ...json(
          z.object({
            items: z.array(sessionSchema),
            nextCursor: z.string().nullable(),
          }),
        ),
      },
    },
  });
  reg.registerPath({
    method: "get",
    path: "/v1/sessions/{id}",
    security: [{ [bearer.name]: [] }],
    responses: {
      200: {
        description: "session",
        ...json(
          z.object({
            session: sessionSchema,
            summary: sessionSummarySchema.nullable(),
          }),
        ),
      },
    },
  });
  reg.registerPath({
    method: "post",
    path: "/v1/keys",
    security: [{ [bearer.name]: [] }],
    request: { body: json(createKeyRequestSchema) },
    responses: {
      201: { description: "created", ...json(createKeyResponseSchema) },
    },
  });
  reg.registerPath({
    method: "get",
    path: "/v1/keys",
    security: [{ [bearer.name]: [] }],
    responses: {
      200: { description: "list", ...json(z.array(apiKeyPublicSchema)) },
    },
  });

  return new OpenApiGeneratorV31(reg.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "wrud API", version: "0.1.0" },
  });
}
```

- [ ] **Step 5: Write `packages/server/src/app.ts`**

```ts
/**
 * buildApp - the dependency-injection seam. Returns a configured Hono app with zero
 * global state. The Node entry hands it real adapters; tests hand it Memory* adapters
 * and exercise the same app in-process.
 */
import { Hono } from "hono";
import type {
  StorageAdapter,
  Summarizer,
  RateLimiter,
  Clock,
} from "@wrud/shared";
import { AppError, errorBody } from "./http/errors.js";
import { metaRoutes } from "./http/routes-meta.js";
import { sessionRoutes } from "./http/routes-sessions.js";
import { keyRoutes } from "./http/routes-keys.js";

export interface AppDeps {
  storage: StorageAdapter;
  summarizer: Summarizer;
  rateLimiter: RateLimiter;
  clock?: Clock;
}

export type AppEnv = {
  Variables: { deps: Required<AppDeps>; apiKeyId: string };
};

export function buildApp(deps: AppDeps) {
  const resolved: Required<AppDeps> = { clock: () => new Date(), ...deps };
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("deps", resolved);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof AppError)
      return c.json(errorBody(err), err.status as 400);
    console.error("unhandled error:", err); // never logs request bodies/secrets
    return c.json(
      { error: { code: "internal", message: "internal error" } },
      500,
    );
  });

  app.route("/", metaRoutes);
  app.route("/v1", sessionRoutes);
  app.route("/v1", keyRoutes);
  return app;
}
```

- [ ] **Step 6: Create route stubs so the app compiles** - `routes-sessions.ts` and `routes-keys.ts` exporting empty `new Hono()` for now (filled in 4.4/4.5). Then run `npx vitest run packages/server/src/app.test.ts`.
      Expected: PASS for `/health` and `/openapi.json` (if zod-to-openapi works; otherwise implement the hand-built fallback in `openapi.ts` and re-run).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/http package-lock.json packages/server/package.json
git commit -m "feat(server): buildApp DI seam + meta routes + OpenAPI document"
```

### Task 4.3: Auth middleware

**Files:**

- Create: `packages/server/src/http/auth-middleware.ts`
- Test: `packages/server/src/http/auth-middleware.test.ts`

- [ ] **Step 1: Write the failing test** - exercise via a tiny app that mounts the middleware on a protected route.

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireScope } from "./auth-middleware.js";
import type { AppEnv } from "../app.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { hashApiKey } from "../auth/keys.js";

function appWith(scopes: any) {
  const storage = new MemoryStorageAdapter();
  storage.createApiKey({
    id: "k1",
    name: "n",
    prefix: "p",
    hash: hashApiKey("secret"),
    scopes,
    createdAt: "2026-06-25T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  const deps = {
    storage,
    summarizer: {} as any,
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date(0),
  };
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("deps", deps as any);
    await next();
  });
  app.get("/p", requireScope("read"), (c) =>
    c.json({ ok: true, keyId: c.get("apiKeyId") }),
  );
  return app;
}

describe("requireScope middleware", () => {
  it("401 without a key", async () => {
    expect((await appWith(["read"]).request("/p")).status).toBe(401);
  });
  it("401 with an unknown key", async () => {
    const res = await appWith(["read"]).request("/p", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });
  it("403 with insufficient scope", async () => {
    const res = await appWith(["ingest"]).request("/p", {
      headers: { authorization: "Bearer secret" },
    });
    expect(res.status).toBe(403);
  });
  it("200 with a valid key + scope, exposes keyId", async () => {
    const res = await appWith(["read"]).request("/p", {
      headers: { "x-api-key": "secret" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).keyId).toBe("k1");
  });
});
```

- [ ] **Step 2: Run (fail), Step 3: Write `packages/server/src/http/auth-middleware.ts`**

```ts
/**
 * requireScope - Hono middleware: extract the key (Bearer or x-api-key), look it up by
 * hash, run the pure ApiKeyGate for the route's required scope, enforce the per-key rate
 * limit, stamp lastUsedAt via the injected clock, and expose the key id to handlers.
 */
import type { MiddlewareHandler } from "hono";
import type { ApiKeyScope } from "@wrud/shared";
import type { AppEnv } from "../app.js";
import { ApiKeyGate } from "../auth/gate.js";
import { hashApiKey } from "../auth/keys.js";
import { AppError } from "./errors.js";

const gate = new ApiKeyGate();

function extractKey(c: any): string | undefined {
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return c.req.header("x-api-key") ?? undefined;
}

export function requireScope(scope: ApiKeyScope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { storage, rateLimiter, clock } = c.get("deps");
    const presented = extractKey(c);
    if (!presented) throw new AppError(401, "unauthorized", "missing api key");

    const key = await storage.getApiKeyByHash(hashApiKey(presented));
    const decision = gate.authorize(key, scope);
    if (!decision.ok)
      throw new AppError(
        decision.status,
        decision.status === 401 ? "unauthorized" : "forbidden",
        decision.reason,
      );

    const rl = rateLimiter.check(key!.id);
    if (!rl.ok)
      throw new AppError(429, "rate_limited", "rate limit exceeded", {
        retryAfterMs: rl.retryAfterMs,
      });

    await storage.touchApiKey(key!.id, clock().toISOString());
    c.set("apiKeyId", key!.id);
    await next();
  };
}
```

- [ ] **Step 4: Run -> PASS; Step 5: Commit**

```bash
git add packages/server/src/http/auth-middleware.ts packages/server/src/http/auth-middleware.test.ts
git commit -m "feat(server): requireScope auth middleware (key -> gate -> ratelimit -> touch)"
```

### Task 4.4: Session routes (ingest + read)

**Files:**

- Modify: `packages/server/src/http/routes-sessions.ts`
- Test: `packages/server/src/http/routes-sessions.test.ts`

- [ ] **Step 1: Write the failing test** - full ingest->summarize->read flow through `buildApp`.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { DeterministicSummarizer } from "../summarize/deterministic.js";
import { hashApiKey } from "../auth/keys.js";

function setup() {
  const storage = new MemoryStorageAdapter();
  storage.createApiKey({
    id: "k1",
    name: "n",
    prefix: "p",
    hash: hashApiKey("sk"),
    scopes: ["ingest", "read"],
    createdAt: "2026-06-25T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  const app = buildApp({
    storage,
    summarizer: new DeterministicSummarizer(
      () => new Date("2026-06-25T11:00:00.000Z"),
    ),
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date("2026-06-25T10:00:00.000Z"),
  });
  const h = { authorization: "Bearer sk", "content-type": "application/json" };
  return { app, h };
}

describe("session routes", () => {
  let app: ReturnType<typeof buildApp>, h: Record<string, string>;
  beforeEach(() => ({ app, h } = setup()));

  it("creates a session, appends events, summarizes, and reads back", async () => {
    const created = await app.request("/v1/sessions", {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        user: { id: "u1" },
        agent: { name: "claude-code" },
      }),
    });
    expect(created.status).toBe(201);
    const { sessionId } = await created.json();

    const ev = (seq: number, name: string) => ({
      id: `e${seq}`,
      sessionId,
      seq,
      timestamp: "2026-06-25T10:00:0" + seq + ".000Z",
      type: "tool_call",
      payload: { name, ok: true },
    });
    const appended = await app.request(`/v1/sessions/${sessionId}/events`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ events: [ev(0, "Edit"), ev(1, "Read")] }),
    });
    expect(appended.status).toBe(202);
    expect((await appended.json()).accepted).toBe(2);

    const summarized = await app.request(
      `/v1/sessions/${sessionId}/summarize`,
      { method: "POST", headers: h },
    );
    expect(summarized.status).toBe(200);
    const summary = await summarized.json();
    expect(summary.stats.eventCount).toBe(2);
    expect(summary.stats.toolCalls).toEqual({ Edit: 1, Read: 1 });

    const read = await app.request(`/v1/sessions/${sessionId}`, { headers: h });
    const body = await read.json();
    expect(body.session.status).toBe("summarized");
    expect(body.summary.sessionId).toBe(sessionId);
  });

  it("rejects a bad create body with 400", async () => {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ user: {} }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });

  it("404s an unknown session on read", async () => {
    expect(
      (await app.request("/v1/sessions/nope", { headers: h })).status,
    ).toBe(404);
  });
});
```

- [ ] **Step 2: Run (fail), Step 3: Write `packages/server/src/http/routes-sessions.ts`**

```ts
/**
 * Session ingest + read routes. Bodies validated against shared zod schemas via
 * safeParse; the deterministic summarizer runs synchronously on summarize.
 */
import { Hono } from "hono";
import {
  createSessionRequestSchema,
  appendEventsRequestSchema,
  newId,
  type Session,
} from "@wrud/shared";
import type { AppEnv } from "../app.js";
import { requireScope } from "./auth-middleware.js";
import { AppError } from "./errors.js";

export const sessionRoutes = new Hono<AppEnv>();

const parse = <T>(
  schema: { safeParse: (v: unknown) => any },
  body: unknown,
): T => {
  const r = schema.safeParse(body);
  if (!r.success)
    throw new AppError(400, "bad_request", "validation failed", r.error.issues);
  return r.data as T;
};

sessionRoutes.post("/sessions", requireScope("ingest"), async (c) => {
  const { storage, clock } = c.get("deps");
  const body = parse<ReturnType<typeof createSessionRequestSchema.parse>>(
    createSessionRequestSchema,
    await c.req.json().catch(() => null),
  );
  const now = clock().toISOString();
  const session: Session = {
    id: newId(),
    apiKeyId: c.get("apiKeyId"),
    user: body.user,
    agent: body.agent,
    runtime: body.runtime ?? {},
    metadata: body.metadata ?? {},
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
    const { events } = parse<{ events: any[] }>(
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
    const { items: events } = await storage.getEvents(id, { limit: 100000 });
    const summary = await summarizer.summarize(session, events);
    await storage.saveSummary(summary);
    await storage.setSessionStatus(id, "summarized", clock().toISOString());
    return c.json(summary, 200);
  },
);

sessionRoutes.get("/sessions", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const q = c.req.query();
  const page = await storage.listSessions({
    user: q.user,
    status: q.status as any,
    from: q.from,
    to: q.to,
    limit: q.limit ? Number(q.limit) : undefined,
    cursor: q.cursor ?? null,
  });
  return c.json(page, 200);
});

sessionRoutes.get("/sessions/:id", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const session = await storage.getSession(c.req.param("id"));
  if (!session) throw new AppError(404, "not_found", "session not found");
  const summary = (await storage.getSummary(session.id)) ?? null;
  return c.json({ session, summary }, 200);
});

sessionRoutes.get("/sessions/:id/events", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const id = c.req.param("id");
  if (!(await storage.getSession(id)))
    throw new AppError(404, "not_found", "session not found");
  const q = c.req.query();
  const page = await storage.getEvents(id, {
    limit: q.limit ? Number(q.limit) : undefined,
    cursor: q.cursor ?? null,
  });
  return c.json(page, 200);
});
```

- [ ] **Step 4: Run -> PASS; Step 5: Commit**

```bash
git add packages/server/src/http/routes-sessions.ts packages/server/src/http/routes-sessions.test.ts
git commit -m "feat(server): session ingest + read routes (create/events/summarize/list/get)"
```

### Task 4.5: Key management routes

**Files:**

- Modify: `packages/server/src/http/routes-keys.ts`
- Test: `packages/server/src/http/routes-keys.test.ts`

- [ ] **Step 1: Write the failing test** - admin creates a key (plaintext once), lists (no hash), revokes.

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { DeterministicSummarizer } from "../summarize/deterministic.js";
import { hashApiKey } from "../auth/keys.js";

function setup() {
  const storage = new MemoryStorageAdapter();
  storage.createApiKey({
    id: "admin",
    name: "boot",
    prefix: "p",
    hash: hashApiKey("ADMIN"),
    scopes: ["admin"],
    createdAt: "2026-06-25T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  const app = buildApp({
    storage,
    summarizer: new DeterministicSummarizer(() => new Date(0)),
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date("2026-06-25T10:00:00.000Z"),
  });
  return {
    app,
    storage,
    h: { authorization: "Bearer ADMIN", "content-type": "application/json" },
  };
}

describe("key routes", () => {
  it("creates a key returning the secret once, lists without hash, revokes", async () => {
    const { app, storage, h } = setup();
    const created = await app.request("/v1/keys", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "ingest key", scopes: ["ingest"] }),
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.secret).toMatch(/^wrud_sk_local_/);
    expect(body.apiKey.hash).toBeUndefined();

    // the returned secret actually works + was stored as a hash
    expect(await storage.getApiKeyByHash(hashApiKey(body.secret))).toBeTruthy();

    const list = await (await app.request("/v1/keys", { headers: h })).json();
    expect(list.find((k: any) => k.hash)).toBeUndefined();

    const del = await app.request(`/v1/keys/${body.apiKey.id}`, {
      method: "DELETE",
      headers: h,
    });
    expect(del.status).toBe(204);
  });

  it("403 when caller lacks admin scope", async () => {
    const { app, storage } = setup();
    storage.createApiKey({
      id: "r",
      name: "r",
      prefix: "p",
      hash: hashApiKey("READ"),
      scopes: ["read"],
      createdAt: "2026-06-25T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    });
    const res = await app.request("/v1/keys", {
      method: "POST",
      headers: {
        authorization: "Bearer READ",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "x", scopes: ["read"] }),
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run (fail), Step 3: Write `packages/server/src/http/routes-keys.ts`**

```ts
/**
 * API key management (scope: admin). Creation returns the plaintext secret exactly once;
 * only the SHA-256 hash is stored. List/read never expose the hash.
 */
import { Hono } from "hono";
import {
  createKeyRequestSchema,
  apiKeyPublicSchema,
  newId,
  type ApiKey,
} from "@wrud/shared";
import type { AppEnv } from "../app.js";
import { requireScope } from "./auth-middleware.js";
import { AppError } from "./errors.js";
import { generateApiKey, hashApiKey } from "../auth/keys.js";

export const keyRoutes = new Hono<AppEnv>();

keyRoutes.post("/keys", requireScope("admin"), async (c) => {
  const { storage, clock } = c.get("deps");
  const parsed = createKeyRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new AppError(
      400,
      "bad_request",
      "validation failed",
      parsed.error.issues,
    );

  const { fullKey, prefix } = generateApiKey("local");
  const key: ApiKey = {
    id: newId(),
    name: parsed.data.name,
    prefix,
    hash: hashApiKey(fullKey),
    scopes: parsed.data.scopes,
    createdAt: clock().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  await storage.createApiKey(key);
  return c.json(
    { apiKey: apiKeyPublicSchema.parse(key), secret: fullKey },
    201,
  );
});

keyRoutes.get("/keys", requireScope("admin"), async (c) => {
  const { storage } = c.get("deps");
  const keys = (await storage.listApiKeys()).map((k) =>
    apiKeyPublicSchema.parse(k),
  );
  return c.json(keys, 200);
});

keyRoutes.delete("/keys/:id", requireScope("admin"), async (c) => {
  const { storage } = c.get("deps");
  await storage.revokeApiKey(c.req.param("id"));
  return c.body(null, 204);
});
```

- [ ] **Step 4: Run -> PASS; Step 5: full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/http/routes-keys.ts packages/server/src/http/routes-keys.test.ts
git commit -m "feat(server): admin api-key routes (create/list/revoke), secret shown once"
```

---

## Chunk 5: Node entry + seed script + local smoke

### Task 5.1: Node serve entry

**Files:**

- Create: `packages/server/src/node/serve.ts`

- [ ] **Step 1: Write `packages/server/src/node/serve.ts`**

```ts
/**
 * Local Node entry. Constructs the real adapters (local SQLite, in-process rate limiter)
 * and serves the same buildApp() Hono app via @hono/node-server. No cloud dependency.
 *
 * Env: WRUD_DB (default ./wrud.db), WRUD_PORT (default 8787),
 *      WRUD_RATE_LIMIT (default 120), WRUD_RATE_WINDOW_MS (default 60000).
 */
import { serve } from "@hono/node-server";
import { buildApp } from "../app.js";
import { SqliteStorageAdapter } from "../storage/sqlite.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { DeterministicSummarizer } from "../summarize/deterministic.js";

const dbPath = process.env.WRUD_DB ?? "./wrud.db";
const port = Number(process.env.WRUD_PORT ?? 8787);

const app = buildApp({
  storage: new SqliteStorageAdapter(dbPath),
  summarizer: new DeterministicSummarizer(),
  rateLimiter: new MemoryRateLimiter({
    limit: Number(process.env.WRUD_RATE_LIMIT ?? 120),
    windowMs: Number(process.env.WRUD_RATE_WINDOW_MS ?? 60000),
  }),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`wrud server on http://localhost:${info.port} (db: ${dbPath})`);
});
```

- [ ] **Step 2: Smoke test the server manually**

Run: `WRUD_DB=./.tmp-smoke.db npm run serve &` then `sleep 1 && curl -s localhost:8787/health`
Expected: `{"ok":true}`. Then `curl -s localhost:8787/openapi.json | head -c 40` shows an OpenAPI doc. Kill the server; `rm -f ./.tmp-smoke.db*`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/node/serve.ts
git commit -m "feat(server): local Node serve entry (@hono/node-server + SQLite)"
```

### Task 5.2: Bootstrap admin key seed script

**Files:**

- Create: `packages/server/scripts/seed-admin-key.ts`

- [ ] **Step 1: Write `packages/server/scripts/seed-admin-key.ts`**

```ts
/**
 * Seed a bootstrap admin key into the local DB so the first POST /v1/keys can be
 * authorized. Prints the plaintext ONCE - copy it now, it is never recoverable.
 * Usage: WRUD_DB=./wrud.db npm run seed:key
 */
import { SqliteStorageAdapter } from "../src/storage/sqlite.js";
import { generateApiKey, hashApiKey } from "../src/auth/keys.js";
import { newId } from "@wrud/shared";

const storage = new SqliteStorageAdapter(process.env.WRUD_DB ?? "./wrud.db");
const { fullKey, prefix } = generateApiKey("local");
await storage.createApiKey({
  id: newId(),
  name: "bootstrap-admin",
  prefix,
  hash: hashApiKey(fullKey),
  scopes: ["admin", "read", "ingest"],
  createdAt: new Date().toISOString(),
  lastUsedAt: null,
  revokedAt: null,
});
console.log("Bootstrap admin key (shown once):\n\n  " + fullKey + "\n");
```

- [ ] **Step 2: Smoke test it end to end**

Run:

```bash
WRUD_DB=./.tmp-seed.db npm run seed:key            # capture the printed key as $KEY
WRUD_DB=./.tmp-seed.db npm run serve &              # start server on the same DB
sleep 1
curl -s -X POST localhost:8787/v1/keys -H "authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"name":"ci","scopes":["ingest"]}'
```

Expected: `201` with `secret` starting `wrud_sk_local_`. Kill server; `rm -f ./.tmp-seed.db*`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/scripts/seed-admin-key.ts
git commit -m "feat(server): seed-admin-key bootstrap script"
```

---

## Chunk 6: SDK + Claude Code adapter

### Task 6.1: SDK client + session handle

**Files:**

- Create: `packages/sdk/package.json`, `packages/sdk/src/client.ts`, `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/client.test.ts`

- [ ] **Step 1: Write `packages/sdk/package.json`**

```json
{
  "name": "@wrud/sdk",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts", "./claude-code": "./src/claude-code.ts" },
  "dependencies": { "@wrud/shared": "*" }
}
```

Run: `npm install`.

- [ ] **Step 2: Write the failing test `packages/sdk/src/client.test.ts`** - run the SDK against the in-process server (the real `buildApp`), proving the contract end to end.

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../../server/src/app.js";
import { MemoryStorageAdapter } from "../../server/src/storage/memory.js";
import { MemoryRateLimiter } from "../../server/src/ratelimit/memory.js";
import { DeterministicSummarizer } from "../../server/src/summarize/deterministic.js";
import { hashApiKey } from "../../server/src/auth/keys.js";
import { createWrudClient } from "./client.js";

function harness() {
  const storage = new MemoryStorageAdapter();
  storage.createApiKey({
    id: "k1",
    name: "n",
    prefix: "p",
    hash: hashApiKey("sk"),
    scopes: ["ingest", "read"],
    createdAt: "2026-06-25T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  const app = buildApp({
    storage,
    summarizer: new DeterministicSummarizer(
      () => new Date("2026-06-25T11:00:00.000Z"),
    ),
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date("2026-06-25T10:00:00.000Z"),
  });
  // a fetch that routes straight into the Hono app (no network)
  const fetchImpl = (url: string, init?: RequestInit) =>
    app.request(url, init as any);
  return {
    client: createWrudClient({
      baseUrl: "http://x",
      apiKey: "sk",
      fetch: fetchImpl as any,
    }),
    storage,
  };
}

describe("SDK client", () => {
  it("starts a session, buffers events, and summarizes (flush on summarize)", async () => {
    const { client } = harness();
    const session = await client.startSession({
      user: { id: "u1" },
      agent: { name: "claude-code" },
    });
    session.event({ type: "tool_call", name: "Edit", ok: true });
    session.event({
      type: "model_use",
      model: "claude-opus-4-8",
      outputTokens: 30,
      task: "rename",
    });
    const summary = await session.summarize();
    expect(summary.stats.eventCount).toBe(2);
    expect(summary.stats.toolCalls).toEqual({ Edit: 1 });
  });

  it("event() never throws on a malformed event (resilient by contract)", async () => {
    const { client } = harness();
    const session = await client.startSession({
      user: { id: "u1" },
      agent: { name: "claude-code" },
    });
    expect(() => session.event({ type: "tool_call" } as any)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run (fail), Step 4: Write `packages/sdk/src/client.ts`**

```ts
/**
 * @wrud/sdk - thin client over the wrud HTTP API. The session handle accepts the
 * ergonomic flat event shape, assembles the { id, sessionId, seq, timestamp, type,
 * payload } wire envelope, buffers in memory, and flushes in batches / on summarize.
 * event() is resilient by contract: it never throws into the host agent.
 */
import {
  newId,
  eventSchema,
  type CreateSessionRequest,
  type Event,
  type EventType,
  type SessionSummary,
} from "@wrud/shared";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface WrudClientOptions {
  baseUrl?: string; // default http://localhost:8787
  apiKey: string;
  fetch?: FetchLike; // injectable for tests
  flushAt?: number; // buffer threshold (default 50)
}

/** Flat event input: { type, ...payloadFields } - the handle builds the wire envelope. */
type FlatEvent = { type: EventType } & Record<string, unknown>;

export function createWrudClient(opts: WrudClientOptions) {
  const baseUrl = (opts.baseUrl ?? "http://localhost:8787").replace(/\/$/, "");
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const headers = {
    authorization: `Bearer ${opts.apiKey}`,
    "content-type": "application/json",
  };

  async function post(path: string, body?: unknown) {
    const res = await doFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`wrud ${path} -> ${res.status}`);
    return res.status === 204 ? undefined : res.json();
  }

  return {
    async startSession(req: CreateSessionRequest) {
      const { sessionId } = await post("/v1/sessions", req);
      return new SessionHandle(sessionId, post, opts.flushAt ?? 50);
    },
  };
}

class SessionHandle {
  private buffer: Event[] = [];
  private seq = 0;
  private dropped = 0;
  constructor(
    public readonly sessionId: string,
    private post: (p: string, b?: unknown) => Promise<any>,
    private flushAt: number,
  ) {}

  /** Buffer one event. Never throws - malformed events are validated, dropped, counted. */
  event(flat: FlatEvent): void {
    try {
      const { type, ...payload } = flat;
      const wire = {
        id: newId(),
        sessionId: this.sessionId,
        seq: this.seq,
        timestamp: new Date().toISOString(),
        type,
        payload,
      };
      const parsed = eventSchema.safeParse(wire);
      if (!parsed.success) {
        this.dropped++;
        return;
      }
      this.buffer.push(parsed.data);
      this.seq++;
      if (this.buffer.length >= this.flushAt) void this.flush();
    } catch {
      this.dropped++;
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    await this.post(`/v1/sessions/${this.sessionId}/events`, { events: batch });
  }

  async summarize(): Promise<SessionSummary> {
    await this.flush();
    return this.post(`/v1/sessions/${this.sessionId}/summarize`);
  }

  get droppedCount(): number {
    return this.dropped;
  }
}
```

- [ ] **Step 5: Write `packages/sdk/src/index.ts`**

```ts
export { createWrudClient } from "./client.js";
export type { WrudClientOptions } from "./client.js";
```

- [ ] **Step 6: Run -> PASS; Step 7: Commit**

```bash
git add packages/sdk package-lock.json
git commit -m "feat(sdk): wrud client + buffering session handle (resilient event())"
```

### Task 6.2: Claude Code hook adapter

**Files:**

- Create: `packages/sdk/src/claude-code.ts`
- Test: `packages/sdk/src/claude-code.test.ts`

- [ ] **Step 1: Write the failing test `packages/sdk/src/claude-code.test.ts`** - feed representative Claude Code hook payloads and assert the emitted flat events.

```ts
import { describe, it, expect } from "vitest";
import { hookPayloadToEvents } from "./claude-code.js";

describe("claude-code hook adapter", () => {
  it("maps PreToolUse/PostToolUse to a tool_call event", () => {
    const evs = hookPayloadToEvents({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_response: { ok: true },
      duration_ms: 42,
    });
    expect(evs).toEqual([
      { type: "tool_call", name: "Edit", ok: true, durationMs: 42 },
    ]);
  });
  it("maps a Stop hook to no events (summarize is triggered separately)", () => {
    expect(hookPayloadToEvents({ hook_event_name: "Stop" })).toEqual([]);
  });
  it("ignores unknown hook events", () => {
    expect(hookPayloadToEvents({ hook_event_name: "Whatever" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run (fail), Step 3: Write `packages/sdk/src/claude-code.ts`**

```ts
/**
 * @wrud/sdk/claude-code - translate Claude Code lifecycle hook payloads into wrud's flat
 * event shape. A thin hook script (documented in the SDK README) reads the hook JSON on
 * stdin, calls hookPayloadToEvents(), and feeds them to a SessionHandle whose session id
 * is persisted in a per-session temp file ($TMPDIR/wrud-<sessionId>.json) so hooks across
 * one Claude Code session correlate without colliding with concurrent sessions.
 *
 * Phase 1 ships the pure mapping (unit-tested here) + the handle wiring; the exact hook
 * payload field names are normalized defensively since they may vary by Claude Code version.
 */
type FlatEvent = { type: string } & Record<string, unknown>;

export function hookPayloadToEvents(payload: Record<string, any>): FlatEvent[] {
  switch (payload.hook_event_name) {
    case "PreToolUse":
    case "PostToolUse": {
      const ok = payload.tool_response
        ? payload.tool_response.ok !== false
        : true;
      return [
        {
          type: "tool_call",
          name: String(payload.tool_name ?? "unknown"),
          ok,
          ...(payload.duration_ms != null
            ? { durationMs: Number(payload.duration_ms) }
            : {}),
        },
      ];
    }
    case "Stop":
    case "SessionStart":
    case "SessionEnd":
      return []; // session lifecycle handled by the hook script (start/summarize), not as events
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run -> PASS; Step 5: full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green across all packages.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/claude-code.ts packages/sdk/src/claude-code.test.ts
git commit -m "feat(sdk): claude-code hook payload -> event mapping"
```

### Task 6.3: End-to-end verification + README

**Files:**

- Create: `README.md`

- [ ] **Step 1: Write a concise `README.md`** documenting: what wrud is, `npm install`, `npm run seed:key`, `npm run serve`, an SDK usage snippet, the Claude Code hook wiring (a `.claude/settings.json` `PostToolUse`/`Stop` hook invoking a script that uses `@wrud/sdk/claude-code`), and the local DB/env vars. Reference the spec.

- [ ] **Step 2: Full verification gate**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all unit + integration tests pass.

- [ ] **Step 3: Security review**

Invoke the `security-review` skill (or `project-starter:security-auditor`) over the Phase 1 diff. Focus: key hashing/handling, no secret logging, SQL parameterization, scope enforcement on every mutating route, CORS posture, error bodies not leaking internals. Address any findings, then re-run the verification gate.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: wrud README (local run, SDK usage, Claude Code hook wiring)"
```

---

## Done criteria (Phase 1)

- `npm run typecheck` clean; `npx vitest run` all green.
- `npm run seed:key` then `npm run serve` yields a working local API: create key -> start session -> append events -> summarize -> read back, all over HTTP with API-key auth and per-key rate limiting.
- `GET /openapi.json` serves a 3.1 document generated from the shared schemas; `GET /docs` renders Swagger UI.
- `@wrud/sdk` drives the full flow in-process (proven by tests); `@wrud/sdk/claude-code` maps hook payloads to events.
- Security review completed with findings addressed.
- All Phase 2-4 interfaces (`Summarizer`, `InsightAnalyzer`, `LessonSink`, `RateLimiter`, `StorageAdapter`) are defined and stable.
