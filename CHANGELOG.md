# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- OSS community health files: CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md
- GitHub issue templates (bug report, feature request)
- Pull request template
- Improved CI workflow with separate lint/test/build jobs
- Repository description and topic tags

---

## [0.3.0] - 2026-06-26

### Added

- **Cursor support** (Cursor 1.7+ hooks). `wrud install-hooks --agent cursor` writes `.cursor/hooks.json`; sessions record via Cursor's lifecycle hooks (`sessionStart`, `beforeSubmitPrompt`, `afterFileEdit`, `afterShellExecution`, `afterAgentResponse`, `sessionEnd`). The model name is captured from the hook payload; token/cost numbers are deferred until Cursor's transcript format is documented.
- **Provider registry** (`packages/cli/src/providers.ts`) - the single place agent-specific config path/format, event routing, and payload normalization live. `install-hooks` takes `--agent <id>`; `hook` takes `--provider <id>`.
- `providers/claude-code.md` and `providers/cursor.md` - per-agent "copy to your AI assistant" reference docs, linked from the README.

### Changed

- **De-branded the core.** The server, SDK, schemas, and dashboard are provider-agnostic - no hardcoded agent name (`agent.name` is just a string set by the provider). The summary narrator is generic (`WRUD_NARRATOR_CMD`, default `claude -p`, no API key). README install instructions are agent-neutral and point to `providers/`.

### Removed

- `@wrud/sdk/claude-code` adapter and the `examples/` hook scripts - superseded by `wrud hook` + the provider registry.

---

## [0.2.2] - 2026-06-26

### Changed

- **Summaries now describe the conversation, not the stats.** The LLM narrator is fed the actual captured dialogue (user prompts, assistant replies, tools run) instead of only event/token counts, so it summarizes what the user wanted and what the agent did.
- **`model_use` events are aggregated per model.** `transcriptToUsage` collapses a session's per-message token records into one `model_use` event per model (summed tokens + a `calls` count), instead of one event per assistant message - so a long session no longer produces hundreds of token rows in the event log. The summary's per-model totals are unchanged.

### Added

- Optional `calls` field on the `model_use` event payload (number of underlying assistant API calls a record aggregates; default 1).

---

## [0.1.0] - 2026-06-26

Initial public release on npm as `@wrud/cli`.

### Added

**Core platform (all four phases shipped)**

- **API core** - Hono-based REST API (`/v1/sessions`, `/v1/sessions/{id}/events`, `/v1/sessions/{id}/summarize`) with Bearer token / x-api-key auth
- **Local storage** - SQLite (via `better-sqlite3`) with a Memory adapter for tests; swappable via DI
- **API-key management** - create, list, revoke keys; secrets stored as SHA-256 hashes, plaintext shown once; three scopes: `ingest`, `read`, `admin`
- **Deterministic summarizer** - derives a narrative summary, skill/command list, model-tier breakdown, and cost signals from raw events - no LLM required
- **Optional LLM narrative** - when `WRUD_ANTHROPIC_KEY` is set, Claude Haiku adds a prose narrative to the summary; safe fallback to deterministic mode if unset
- **Insight analyzers** - model right-sizing detector (frontier model used for trivial task?) and error-rate tracker
- **Lessons / memory-teaching** - `GET /v1/lessons` surfaces recurring patterns as agent-memory guidance
- **Enterprise rollup** - `GET /v1/stats/overview` aggregates token usage and insights across all sessions
- **OpenAPI spec** - auto-generated from Zod schemas in `packages/shared`; browsable at `/docs` (Scalar UI)
- **Rate limiting** - per-key sliding-window rate limiter (configurable via `WRUD_RATE_LIMIT` / `WRUD_RATE_WINDOW_MS`)

**SDK (`@wrud/sdk`)**

- `createWrudClient()` - typed client for start / event / summarize lifecycle
- `@wrud/sdk/claude-code` - Claude Code lifecycle hook adapter
- `event()` never throws into the host agent - malformed events are dropped and counted (`session.droppedCount`)

**Dashboard (`apps/platform`)**

- Ant Design + Vite + React platform
- Overview page - org-level rollup (session counts, per-model tokens, insights, lessons)
- Sessions list + per-session detail view with full event log
- API-key management UI
- Lessons view

**CLI (`packages/cli`, published as `@wrud/cli`)**

- `npx @wrud/cli` - starts API + dashboard on one port (`:8787`), seeds a local API key, opens the browser, prints the token
- `install-hooks` / `doctor` - one-command Claude Code hook setup + end-to-end self-test
- State lives in `~/.wrud` - token reused across runs
- Published to public npm (`npmjs.org`)

**Examples**

- `examples/claude-code-hook.ts` - minimal single-file SDK integration
- `examples/cc-hooks/` - full-fidelity Claude Code hook scripts (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd)

**Testing**

- Vitest unit + integration suite (in-process, `:memory:` SQLite)
- Playwright E2E suite (boots API + platform, runs API + browser UI tests)
- GitHub Actions CI workflow (typecheck + unit tests + CLI build)

---

[Unreleased]: https://github.com/eliransu/wrud/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/eliransu/wrud/releases/tag/v0.1.0
