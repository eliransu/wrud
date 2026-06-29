# wrud - Design Spec

**wrud** ("What R U Doing") records what an AI agent did during a session and turns it
into a queryable **Session entity**: what happened, who the user was, which models ran,
what it likely cost, and what could be done better. It is **API-first**: an OpenAPI
contract is the source of truth, a server implements it, and a thin TypeScript SDK wraps
it. A web platform (Ant Design) surfaces API keys and the recorded data.

**wrud is runtime-independent and local-first.** It follows a proven _pattern_ -
swappable **strategy/adapter** interfaces (each shipping a
`Memory*` implementation for tests/local plus a real implementation), pure in-memory core
classes, zod 4, ESM with `.js` imports, heavy "why" JSDoc - but it does **not** depend on
Cloudflare or any hosted platform. The reference/default adapters are **local** (a local
HTTP server and a local SQLite file). Cloudflare (Workers/D1), Postgres, and other hosted
backends are _future adapters_ behind the same interfaces, not prerequisites.

## Why (product goals)

1. Understand what the agent did and the purpose of a session.
2. Educate the user - e.g. flag when a model stronger than necessary was used for a task.
3. Capture lessons the model could be "taught" (memory) so the same mistakes don't recur.
4. Give enterprises/orgs something to track across sessions and users.

This spec delivers the **foundation** that all four goals consume (goal #1 end-to-end;
goals #2-#4 as interfaces wired but their analyzers/UI sequenced into later specs).

## Scope of THIS spec - Phase 1: API core + storage + auth + SDK (all local-first)

In scope, fully specified below:

- OpenAPI 3.1 contract generated from shared zod schemas.
- A **runtime-portable HTTP server** (Hono) whose **default runtime is local Node**
  (`@hono/node-server`). The app is built via dependency injection so other runtimes can
  be added later without changing route logic.
- `StorageAdapter` strategy with `MemoryStorageAdapter` (tests/ephemeral) and
  `SqliteStorageAdapter` (default, local `better-sqlite3` file).
- API-key authentication: generation, hashing, scopes, revocation, in-process rate limit.
- Ingest, read, key-management, and meta endpoints.
- `DeterministicSummarizer` (pure) that materializes a `SessionSummary`.
- `@wrud/sdk` client + a `@wrud/sdk/claude-code` hook adapter.
- Tests, local run/seed scripts, security controls.

**Out of scope of this spec (committed roadmap, each its own spec):**

- Phase 2 - `LlmSummarizer` (Anthropic narrative) + `InsightAnalyzer`s (model right-sizing). Interfaces are defined here; implementations are deferred.
- Phase 3 - Ant Design platform (API-key UI, sessions table + detail, insights views).
- Phase 4 - Lessons / memory-teaching + enterprise org rollups. `LessonSink` interface is defined here; behavior is deferred.
- **Hosted adapters** - Cloudflare Workers runtime entry, D1/Postgres `StorageAdapter`s,
  distributed rate-limit backends. Each is an adapter behind a Phase 1 interface; none is
  required for wrud to run.

The phase boundaries are deliberate: each later phase is a _consumer_ of the Phase 1
contract and storage, so it can be specified and built independently against a stable API.

## Architecture

```
agent / Claude Code hooks
        |  (@wrud/sdk - buffer events, flush on summarize)
        v
  HTTP API (OpenAPI 3.1)
        |
  Hono app  -- default runtime: local Node (@hono/node-server)
   |            (runtime-portable; a Workers/Bun entry can be added later, same app)
   +- ApiKeyGate (auth: hash lookup, scopes) + RateLimiter (in-process counter)
   +- routes: ingest / read / keys / meta
   +- Summarizer (DeterministicSummarizer; LlmSummarizer in Phase 2)
   +- StorageAdapter -- MemoryStorageAdapter (tests/ephemeral)
                     +- SqliteStorageAdapter (default: local better-sqlite3 file)
```

Data flow: SDK opens a session -> buffers typed events locally -> on `summarize()` it
flushes the event batch to the API, then calls the summarize endpoint. The server
validates with zod, persists via the `StorageAdapter`, runs the `DeterministicSummarizer`,
stores the `SessionSummary`, and returns it. The platform (Phase 3) and analyzers
(Phase 2) read the same stored entities.

**Dependency injection is the portability seam.** `buildApp({ storage, summarizer,
rateLimiter, clock })` returns a configured Hono app with zero global state. The Node
entry constructs the real dependencies (SQLite storage, in-process rate limiter) and
serves the app; tests construct `Memory*` dependencies and exercise the same app
in-process. A future hosted entry would construct platform-specific adapters and hand them
to the identical `buildApp`.

`clock: () => Date` is **app-wide**, not just the rate limiter's: every server-stamped
timestamp (`Session.createdAt`/`startedAt`/`endedAt`, `SessionSummary.generatedAt`,
`ApiKey.createdAt`/`lastUsedAt`, and the rate-limit window) reads through it. Production
passes `() => new Date()`; tests pass a fixed/advanceable clock so all time-dependent
units are deterministic. The default is `() => new Date()` when omitted.

## Monorepo layout (npm workspaces, ESM, Node >=20)

```
wrud/
  package.json                 # workspaces: packages/*, apps/*
  tsconfig.json                # NodeNext, strict
  packages/
    shared/                    # zod schemas + inferred types + strategy interfaces (single source of truth)
    server/                    # Hono app, routes, ApiKeyGate, RateLimiter, storage adapters, summarizers, Node entry
    sdk/                       # @wrud/sdk client + /claude-code adapter
  apps/
    platform/                  # React + Ant Design (Vite) -> static SPA against the API   [Phase 3]
  docs/superpowers/specs/
```

`shared` is the single source of truth: every entity is a zod schema, types are inferred
from it, and the OpenAPI document is generated from the same schemas. The server, SDK,
and platform all import `shared`, so the contract cannot drift between them.

## Data model

All entities are zod schemas in `packages/shared`. Types are `z.infer`. IDs are
server-generated UUID strings. Timestamps are ISO-8601 strings (validated as parseable
strings, not a version-specific zod datetime helper, for portability).

### Session

| field       | type                                            | notes                       |
| ----------- | ----------------------------------------------- | --------------------------- |
| `id`        | string (uuid)                                   |                             |
| `apiKeyId`  | string                                          | which key ingested it       |
| `user`      | `{ id: string; email?: string; name?: string }` | who the session belonged to |
| `agent`     | `{ name: string; version?: string }`            | e.g. `claude-code`          |
| `runtime`   | `{ os?: string; model?: string; cwd?: string }` | free-form runtime metadata  |
| `metadata`  | `Record<string, unknown>`                       | caller-supplied extras      |
| `status`    | `'open' \| 'summarized' \| 'abandoned'`         |                             |
| `startedAt` | ISO string                                      |                             |
| `endedAt`   | ISO string \| null                              | set on summarize            |
| `createdAt` | ISO string                                      | server-stamped              |

### Event (append-only, discriminated union on `type`)

Common fields: `id`, `sessionId`, `seq` (monotonic int, caller-assigned), `timestamp` (ISO), `type`.

| `type`        | payload                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool_call`   | `{ name: string; ok: boolean; durationMs?: number; inputSize?: number; outputSize?: number }`                                                           |
| `model_use`   | `{ model: string; inputTokens?: number; outputTokens?: number; task?: string }`                                                                         |
| `file_change` | `{ path: string; op: 'create' \| 'edit' \| 'delete' }`                                                                                                  |
| `message`     | `{ role: 'user' \| 'assistant' \| 'system'; chars: number; text?: string }` (text is the actual message; `tool_call` likewise carries `input`/`output`) |
| `error`       | `{ message: string; kind?: string }`                                                                                                                    |
| `custom`      | `{ name: string; data: Record<string, unknown> }`                                                                                                       |

Idempotency: `(sessionId, seq)` is unique. Re-sending the same `seq` is a no-op (upsert-ignore).
`seq` need not be contiguous: gaps and out-of-order arrival are accepted, and reads return
events ordered by `seq`. This keeps the contract unambiguous for direct (non-SDK) callers.

### SessionSummary

| field               | type           | notes                                                    |
| ------------------- | -------------- | -------------------------------------------------------- |
| `sessionId`         | string         |                                                          |
| `stats`             | object         | deterministic; see below                                 |
| `narrative`         | string \| null | `null` in Phase 1 (filled by `LlmSummarizer` in Phase 2) |
| `insights`          | `Insight[]`    | empty in Phase 1 (filled by analyzers in Phase 2)        |
| `summarizerVersion` | string         | e.g. `deterministic@1`                                   |
| `generatedAt`       | ISO string     |                                                          |

`stats`: `{ durationMs, eventCount, toolCalls: Record<name, count>, filesTouched: string[], models: { model, calls, inputTokens, outputTokens }[], errorCount, messageCount }`.

### Insight (interface only in Phase 1)

`{ type: string; severity: 'info' \| 'warn'; title: string; detail: string; evidence: Record<string, unknown> }`

### ApiKey

| field        | type                                | notes                                                   |
| ------------ | ----------------------------------- | ------------------------------------------------------- |
| `id`         | string (uuid)                       |                                                         |
| `name`       | string                              | human label                                             |
| `prefix`     | string                              | non-secret display, e.g. `wrud_sk_local_AB12...`          |
| `hash`       | string                              | SHA-256 of full key; **never returned by any endpoint** |
| `scopes`     | `('ingest' \| 'read' \| 'admin')[]` |                                                         |
| `createdAt`  | ISO string                          |                                                         |
| `lastUsedAt` | ISO string \| null                  |                                                         |
| `revokedAt`  | ISO string \| null                  | revoked when set                                        |

### Lesson (interface only in Phase 1 - `LessonSink` seam for Phase 4)

`{ id: string; sessionId?: string; scope: 'session' \| 'user' \| 'org'; guidance: string; source: string; createdAt: string }`

## Strategy interfaces (strategy/adapter idiom, local-first impls)

### StorageAdapter

```ts
interface StorageAdapter {
  // sessions + events
  createSession(s: Session): Promise<void>;
  getSession(id: string): Promise<Session | undefined>;
  listSessions(f: SessionFilter): Promise<Paginated<Session>>;
  setSessionStatus(
    id: string,
    status: SessionStatus,
    endedAt: string | null,
  ): Promise<void>;
  appendEvents(sessionId: string, events: Event[]): Promise<void>; // idempotent on (sessionId, seq)
  getEvents(sessionId: string, page?: Page): Promise<Paginated<Event>>;
  // summaries
  saveSummary(s: SessionSummary): Promise<void>;
  getSummary(sessionId: string): Promise<SessionSummary | undefined>;
  // api keys
  createApiKey(k: ApiKey): Promise<void>;
  getApiKeyByHash(hash: string): Promise<ApiKey | undefined>;
  listApiKeys(): Promise<ApiKey[]>; // hashes stripped at the route layer
  revokeApiKey(id: string): Promise<void>;
  touchApiKey(id: string, at: string): Promise<void>;
}
```

Phase 1 implementations: `MemoryStorageAdapter` (Map-backed; tests/ephemeral) and
**`SqliteStorageAdapter`** (default; local `better-sqlite3` file, parameterized prepared
statements). The interface is async even though `better-sqlite3` is synchronous, so a
future async backend (Postgres, D1) drops in without changing callers. D1/Postgres are
future adapters, not built in Phase 1.

### Summarizer

```ts
interface Summarizer {
  version: string;
  summarize(session: Session, events: Event[]): Promise<SessionSummary>;
}
```

`DeterministicSummarizer` is **pure** (no I/O): folds events into `stats`, sets
`narrative: null`, `insights: []`. `LlmSummarizer` (Phase 2) wraps it and adds a narrative.

### RateLimiter

```ts
interface RateLimiter {
  check(key: string): { ok: boolean; retryAfterMs?: number };
}
```

`MemoryRateLimiter` (default) is a pure sliding-window counter with an injected clock.
Local-first runs in a single process, so an in-process counter is correct and sufficient;
distributed backends are future adapters.

### InsightAnalyzer (interface only in Phase 1)

```ts
interface InsightAnalyzer {
  analyze(summary: SessionSummary, events: Event[]): Insight[];
}
```

Phase 1 ships an empty analyzer registry; Phase 2 adds `ModelRightsizingAnalyzer`.

### LessonSink (interface only in Phase 1)

```ts
interface LessonSink {
  emit(lesson: Lesson): Promise<void>;
}
```

No implementation in Phase 1; Phase 4 adds sinks (e.g. write to a memory store / `CLAUDE.md`).

## HTTP API (OpenAPI 3.1)

Base path `/v1`. All request/response bodies are zod schemas from `shared`; the OpenAPI
document is generated from them (tooling: `@hono/zod-openapi` if zod-4-compatible, else
`@asteasolutions/zod-to-openapi`; either way the schemas come from `shared`). Auth header:
`Authorization: Bearer <key>` (also accepts `x-api-key`). Each route declares required scopes.

### Ingest (scope: `ingest`)

- `POST /v1/sessions` - body: session-create (user, agent, runtime?, metadata?). -> `201 { sessionId, startedAt }`.
- `POST /v1/sessions/{id}/events` - body: `{ events: Event[] }` (max 500/batch). Idempotent on `seq`. -> `202 { accepted: number }`.
- `POST /v1/sessions/{id}/summarize` - finalize: append any trailing events, run `DeterministicSummarizer`, persist summary, set `status='summarized'`, `endedAt=now`. -> `200 SessionSummary`.

### Read (scope: `read`)

- `GET /v1/sessions` - filters: `user`, `status`, `from`, `to`, `limit`, `cursor`. -> `200 Paginated<Session>`.
- `GET /v1/sessions/{id}` - -> `200 { session, summary | null }`.
- `GET /v1/sessions/{id}/events` - paginated. -> `200 Paginated<Event>`.

### Keys (scope: `admin`)

- `POST /v1/keys` - body: `{ name, scopes }`. -> `201 { apiKey: <ApiKey without hash>, secret: <plaintext, shown once> }`.
- `GET /v1/keys` - -> `200 ApiKey[]` (no `hash`, no secret).
- `DELETE /v1/keys/{id}` - revoke. -> `204`.

A bootstrap admin key is provisioned out-of-band (`scripts/seed-admin-key.ts` writes the
hash to the local DB and prints the plaintext once) so the very first `POST /v1/keys` can
be authorized - there is no public, unauthenticated key-creation route.

### Meta (no auth)

- `GET /openapi.json` - the generated spec.
- `GET /docs` - Swagger UI bound to the spec.
- `GET /health` - `200 { ok: true }`.

### Error shape

All errors: `{ error: { code: string; message: string; details?: unknown } }`.
`400` validation (zod issues in `details`), `401` missing/invalid key, `403` insufficient
scope or revoked key, `404` not found, `409` conflict, `429` rate limited, `500` internal.

## Authentication & rate limiting

`ApiKeyGate` - a pure auth-gate class:

- **Key format**: `wrud_sk_{env}_{random}` where `env in {local, live}` and `random` is
  32 bytes encoded base64url. Only the full key is secret.
- **Storage**: persist SHA-256(`fullKey`) as `hash` plus a non-secret `prefix` for display.
  A plain SHA-256 (not a slow KDF like bcrypt/argon2) is acceptable here precisely because
  the key is high-entropy (32 random bytes), so it is not brute-forceable the way a
  human-chosen password would be. Auth looks the presented key up by its hash
  (`getApiKeyByHash`); a miss -> `401`.
- **Scopes**: `ingest`, `read`, `admin`. Routes assert required scopes -> `403` on shortfall.
- **Revocation**: `revokedAt` set -> treated as `401/403`.
- **Rate limit**: per-key sliding window via `MemoryRateLimiter`, default 120 req/min,
  `429` on exceed. The limiter is a pure, clock-injected counter held in the server
  process (correct for a local single-process deployment). A distributed limiter is a
  future adapter behind the `RateLimiter` interface.

## Error handling & resilience

- Server validates every input with zod; failures return `400` with structured `details`.
- The SDK is **resilient by contract**: `event()` never throws into the host agent -
  it buffers in memory inside try/catch and drops+counts malformed events. A failed flush
  is retried with backoff; on permanent failure the SDK logs to its own diagnostics and
  the host is unaffected.
- `summarize` runs the deterministic summarizer synchronously (it is fast and pure). When
  `LlmSummarizer` lands (Phase 2) its network call is time-boxed and falls back to the
  deterministic summary with `narrative: null` on any failure.
- The server never logs secrets, full keys, or message content.

## Security

(Reviewed with the `security-review` skill on the diff before each phase merges.)

- API keys stored only as SHA-256 hashes; plaintext shown once; never logged or returned.
- No unauthenticated mutation route; key creation requires `admin` scope; bootstrap key
  seeded via the local seed script.
- **Content capture by default**: wrud is local-first and records your own sessions to your
  own server, so events carry real content - `tool_call` includes the actual `input`/`output`,
  `message` includes `text` (with `chars` as a cheap stat). That content is what makes a
  session understandable ("what r u doing"). Hosts that need redaction can strip/cap fields
  client-side before sending (the SDK never forces it); the example Claude Code hook caps each
  content field to keep event sizes sane.
- All SQL is parameterized via `better-sqlite3` prepared statements.
- Per-key rate limiting bounds cost/abuse.
- CORS on the platform-facing read/admin routes restricted to the platform origin. The
  unauthenticated meta routes (`/health`, `/openapi.json`, `/docs`) may be served with an
  open CORS policy since they expose no data - only the contract and a liveness flag.
- The local DB file is created with user-only permissions; its path is configurable
  (default `./wrud.db`, override via env).

## SDK (`@wrud/sdk`)

```ts
const client = createWrudClient({ baseUrl, apiKey }); // baseUrl defaults to http://localhost:8787
const session = client.startSession({ user, agent, runtime, metadata });
session.event({ type: "tool_call", name: "Edit", ok: true, durationMs: 12 });
session.event({
  type: "model_use",
  model: "claude-opus-4-8",
  outputTokens: 320,
  task: "rename var",
});
const summary = await session.summarize(); // flushes buffered events, then summarizes
```

- The session handle accepts the ergonomic **flat** event shape shown above
  (`{ type, ...payloadFields }`) and assembles the `{ id, sessionId, seq, timestamp, type,
payload }` wire envelope itself - assigning `id`, a monotonic `seq`, and `timestamp` so
  callers never manage them. It buffers events in memory and flushes in batches (on
  threshold or on `summarize`). All client calls are typed from `shared`.
- `@wrud/sdk/claude-code` - an adapter that maps Claude Code hook payloads to core events
  and is wired via a tiny hook script in `.claude/settings.json`:
  `SessionStart -> startSession`, `PreToolUse/PostToolUse -> tool_call`,
  assistant turns -> `model_use`/`message`, `Stop`/a `/wrud` summarize command -> `summarize`.
  Session id is persisted in a per-session temp file (path keyed by the Claude Code
  session id / PID, e.g. `$TMPDIR/wrud-<sessionId>.json`) for the session's duration so
  hooks correlate without colliding across concurrent sessions.

## Testing

- **vitest**, unit + integration, against `MemoryStorageAdapter`.
- `DeterministicSummarizer` is pure -> golden tests over fixed event fixtures.
- `ApiKeyGate` and `MemoryRateLimiter` tested with an injected clock.
- Route integration tests run the Hono app in-process (via `buildApp` with `Memory*` deps).
- `SqliteStorageAdapter` tested against a temp-file (or `:memory:`) `better-sqlite3` DB.
- SDK tested against an in-process server; the `claude-code` adapter tested by feeding
  recorded hook payloads and asserting the emitted events.

## Running locally

- `npm run serve` (workspace `server`) starts the Node server on a port (default 8787),
  opening/creating the local SQLite DB file (default `./wrud.db`, configurable via env).
- DB schema is applied at startup from `packages/server/migrations/0001_init.sql`.
- `npm run seed:key` runs `scripts/seed-admin-key.ts` to create a bootstrap `admin` key,
  printing the plaintext once.
- No cloud account, no wrangler, no Docker required. (A Dockerfile and hosted adapters may
  be added later as their own specs.)

## Phasing summary

| Phase    | Deliverable                                                                    | Spec                  |
| -------- | ------------------------------------------------------------------------------ | --------------------- |
| 1 (this) | API core + local storage + auth + `DeterministicSummarizer` + SDK + CC adapter | this document         |
| 2        | `LlmSummarizer` + `InsightAnalyzer`s (model right-sizing, education)           | own spec              |
| 3        | Ant Design platform: API-key UI, sessions table + detail, insights             | own spec              |
| 4        | Lessons / memory-teaching + enterprise org rollups                             | own spec              |
| -        | Hosted adapters (Cloudflare/D1/Postgres runtime + storage)                     | own spec(s), optional |

Interfaces consumed by phases 2-4 and the hosted adapters (`Summarizer`, `InsightAnalyzer`,
`LessonSink`, `RateLimiter`, `StorageAdapter`, the read API, the storage contract) are all
defined and stable in Phase 1, so each later phase builds against a fixed surface.

## Phase 5 — Facet index, smart filters, Reports (this iteration)

**Problem.** Every dimension worth filtering or reporting on (models, tools, skills,
slash-commands, MCP extensions, files, error kinds) lived only inside `events.payload_json`.
The `model` filter ran a full-events `json_extract` subquery; agent was an unindexed
`json_extract`; skills/commands/MCPs were extracted client-side per session and never indexed;
and the UI filter dropdowns were populated only from the loaded page, so you couldn't
search-and-select across the whole dataset. The sessions list also fetched all matches and
sliced in JS.

**Decision — keep SQLite, add an indexed facet layer (not a new engine).** A local-first
`npx wrud` tool doesn't need Postgres/columnar; it needs the dimensions lifted out of JSON
into indexed rows. The `StorageAdapter` seam still lets a hosted adapter drop in later.

- **`session_facets(session_id, dim, value)`** — one denormalized row per dimension value.
  `dim ∈ {user, agent, model, tool, mcp, skill, command, file_ext, error_kind}`. The
  `(dim, value)` index serves both "distinct values for a dim" (facets) and "sessions where
  dim=value" (filters). `status` is NOT a facet — it's an indexed column that mutates over the
  lifecycle; faceting it would mean rewriting rows. Tokens/dates are continuous → range
  predicates, not facets.
- **Live rollup counters on the session row** (`event_count`, `input_tokens`, `output_tokens`)
  maintained inside the existing `appendEvents` transaction (gated on actual insert so duplicate
  seqs don't double-count). The sessions list and token-range filters read these instead of
  scanning events.
- **Maintained incrementally** (createSession → user/agent; appendEvents → event dims; gated),
  so open sessions are queryable, not just finalized ones. A one-time **backfill** on adapter
  construction populates facets + counters for any DB written before this feature.
- **Facet taxonomy is one source of truth** in `packages/shared/src/facets.ts`
  (`sessionFacets`, `eventFacets`, `eventTokens`), reused by both storage adapters and the backfill.

**Filter language** (`packages/server/src/http/filter.ts`, shared by `/sessions` and `/reports`):
each dim accepts a comma-separated list — OR within a dim, AND across dims — plus `from`/`to`
(createdAt range), `minInputTokens`/`minOutputTokens`, `hasError`, and keyset pagination on
`(created_at, id)` (replaces fetch-all-slice).

**New endpoints (scope: read):**
- `GET /v1/facets[?dim=&q=]` — distinct values + session counts per dim; `q` is a prefix
  type-ahead. Powers global search-and-select.
- `GET /v1/reports/summary` — `{ total, byDim (top-N per dim + status), trend (sessions/day) }`
  over the same filter. `?top=N` controls values per dim.

**Platform:** `<FacetFilterBar>` (searchable multi-selects from `/facets`) shared by the
Sessions page and a new **Reports** page. Reports = filter builder → stat tiles + per-dim
top-N bars + daily-trend line + a drill-down sessions table. Filter state is URL-encoded
(shareable/bookmarkable); no saved/named reports (deliberately ad-hoc for now).
