# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.7.0] - 2026-07-02

### Added

- **Topics & categories.** The narrator now returns a tagged `<summary><topic><category>`
  response in its single existing call: a free-form 2-5 word topic plus one of nine fixed
  categories (debugging, feature, refactor, research, design, content, ops, data, other -
  Anthropic's published Claude Code task taxonomy). Both become filterable facets and chart
  on Reports ("Top topics", "Categories", "Top projects") and the Overview ("By category",
  "Top projects"). Without a narrator nothing is guessed: topic/category stay null and the
  deterministic `project` facet (cwd basename - a fact) carries the dimension.
- **Context column on Sessions** - the user's own first prompt per session, clipped, with
  the full text on native hover; shows the LLM topic + category once summarized.

### Changed

- **Right-sizing insight actually fires now, with dollars.** The old gates (zero errors,
  ≤5 events) suppressed the flag on every real session, and zero-token model rows flagged
  as noise. v2: any high-tier model with real-but-small output (≤400 tokens) flags, with
  `~$actual vs ~$low-tier` amounts in the insight and the lesson.
- **Lessons page dedups.** The same insight recurring across sessions renders as one card
  with a `seen ×N` counter instead of a wall of identical cards.

### Fixed

- **Installs on Node 26.** `better-sqlite3` bumped `^11` → `^12`: v11 has no Node 26
  prebuilds and its source no longer compiles against Node 26's V8 headers, so
  `npx @wrud/cli` failed for anyone on current Node. v12 ships prebuilt platform binaries
  (no node-gyp, no build tools needed). Verified end-to-end on Node 26.4.0. (0.6.0 on npm
  predates this fix - Node 26 users need >= 0.7.0.)

---

## [0.6.0] - 2026-07-02

_Note: published mid-development; superseded same-day by 0.7.0, which carries the Node 26
install fix._

### Added

- **`~$` cost estimates across the dashboard** from a built-in list-price table
  (`@wrud/shared/pricing`, prices verified 2026-07-02): a `~$` column on the Sessions
  list, a `~$ cost` tile + per-model cost on the session detail, and a `~$ cost (est.)`
  rollup on the Overview. Estimates use list prices only - cache discounts are not
  modeled, so cache-heavy sessions read as an upper bound; unknown models show `-`
  instead of a wrong number.
- OSS community health files: CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md
- GitHub issue templates (bug report, feature request)
- Pull request template
- Improved CI workflow with separate lint/test/build jobs
- Repository description and topic tags

### Changed

- **Messaging is "AI-agent sessions" everywhere** (README, npm README, dashboard
  onboarding, and the narrator prompt) - wrud records any agent's work; coding is one
  segment, not the category.

### Fixed

- **Chart tooltips are readable in dark mode** - recharts inlines item text as black
  when bar fills live on `<Cell>`s; the theme now forces tooltip text to ink.
- **Lessons empty-state and cards are theme-aware** (no more hardcoded white borders in
  light mode) and lesson cards carry a tone-colored accent border.

---

## [0.5.5] - 2026-06-30

### Changed

- **Sessions `+N` models indicator uses the browser's native tooltip** instead of a popover component. Hovering the `+N` chip still lists the other models; the markup is smaller and drops the extra UI dependency.

---

## [0.5.4] - 2026-06-30

### Fixed

- **Dashboard fonts load offline / under CSP.** Self-hosted the fonts (JetBrains Mono, Hanken Grotesk, Bricolage Grotesque, via `@fontsource`) instead of `@import`-ing Google Fonts — which the dashboard's no-egress CSP blocked, leaving it on fallback fonts. The intended typography now renders, and nothing leaves your machine.

### Changed

- **Top nav uses the regular sans font** (was monospace, which looked out of place).
- **Sessions list keeps a single-line row for models** — a session with several models shows the first plus a `+N` hover popover listing them all, instead of stacking chips and growing the row height.
- **The whole Sessions row is clickable** (opens the session), not just the id cell.

---

## [0.5.3] - 2026-06-29

### Fixed

- **Filter dropdowns no longer flicker.** The Sessions/Reports facet selects used AntD's `maxTagCount="responsive"` inside a flex-wrap row, which drove a ResizeObserver measure→render loop once a filter had a selected value. Switched to a fixed tag count + fixed width.

### Changed

- **No deterministic narrative.** A summarized session's narrative now comes only from the LLM narrator; without one it stays blank instead of showing a stats-template sentence ("A … session over N; top tools …"). Stats, models and insights are unchanged.

---

## [0.5.2] - 2026-06-29

### Changed

- **Top navigation realigned** to a three-zone header — brand on the left, sections centered, settings on the right.
- **Settings dropdown.** The theme toggle and "Change key" are now consolidated behind a single gear menu on the right of the header.
- **Leaner Sessions filters.** The Sessions page shows a focused set (user, agent, model, status, date range); the full dimension set lives on Reports.
- **Newest-first event log.** A session's event log is now ordered LIFO (most recent at the top).

---

## [0.5.1] - 2026-06-29

### Added

- **Name your agents.** `WRUD_AGENT_NAME` (and optional `WRUD_AGENT_VERSION`) override the auto-detected agent label, so you can tag a session source however you like — e.g. mark a remote box `prod-bot` even though it's really claude-code. Custom names flow straight into the Sessions filters and the Reports dimensions.

### Changed

- **Top navigation instead of a sidebar.** The dashboard nav moved into a sticky top header (brand · sections · theme toggle), giving pages the full width.
- **Refined light theme.** Light mode went from a flat, pale wash to crisp white cards lifting off a soft sage canvas with real shadows, and the charts now use a deep green/teal palette instead of the dark theme's acid-lime so they read cleanly on white. Dark mode is unchanged.

---

## [0.5.0] - 2026-06-29

### Added

- **Reports page — build a query, see the answer.** A new dashboard section where you pick filters (users, agents, models, skills, slash-commands, tools, MCP extensions, file types, error kinds, status, date range, token floors) and get stat tiles, per-dimension top-N charts, a sessions-over-time trend, and a drill-down table of the matching sessions. Filter state lives in the URL, so any query is shareable and bookmarkable.
- **Search-and-select filters across your whole dataset.** `GET /v1/facets` returns the distinct values (with session counts) for every dimension, with prefix type-ahead. The Sessions and Reports filter pickers now search every user/model/skill/tool that ever appeared — not just the rows currently on screen.
- **`GET /v1/reports/summary`** — total + per-dimension top values + daily trend over any filter, sharing the exact query language as `GET /v1/sessions`.

### Changed

- **Sessions are indexed by dimension for fast, scalable queries.** A denormalized `session_facets` index (user, agent, model, tool, mcp, skill, command, file_ext, error_kind) plus live per-session rollup counters (events, input/output tokens) are maintained as events arrive. Filtering and reporting are now indexed lookups instead of scanning event JSON, and the sessions list uses keyset pagination. Existing databases are backfilled automatically on first start — no migration step. (Storage stays local SQLite; the adapter seam still allows a hosted backend later.)
- **Richer session filters.** Every dimension accepts multiple values (OR within a dimension, AND across dimensions), plus `hasError` and minimum input/output token thresholds.

---

## [0.4.5] - 2026-06-29

### Added

- **Light + dark dashboard theme.** The dashboard now follows your OS `prefers-color-scheme` and adds a sun/moon toggle in the header that persists your choice (`localStorage`). AntD swaps between its light/dark algorithms with palette-matched tokens, and the theme is applied before first paint so there's no flash. (The landing site got the same treatment.)
- **One-command setup.** `npx @wrud/cli` now auto-wires your installed agents' hooks on startup (idempotent; only touches a config that isn't already wired). Skip it with `--no-install-hooks`; `install-hooks` is still there for explicit/`--project` use and end-to-end verification.
- **Auto-connect the dashboard.** The browser opens at `/?key=<token>`, so the dashboard connects without pasting. The token is adopted, persisted to this browser, and immediately stripped from the URL.

### Changed

- **The dashboard bounces to the Connect screen on `401`/`403`.** A rejected or expired key is cleared and you're returned to Connect with a notice, instead of the page silently failing to load.

---

## [0.4.4] - 2026-06-28

### Fixed

- **`cleanup` no longer reports "1 failed".** Run from `$HOME`, the user and project scopes resolve to the same settings file - sometimes via a symlink (`/tmp` -> `/private/tmp`), so the path strings differ. cleanup now dedupes by **real path** and removes ENOENT-safely, and it **stops a running server first** so the data dir can't be regenerated mid-cleanup.

### Added

- **`wrud stop`** - stop the running server on `WRUD_PORT` (also used internally by `cleanup`).

---

## [0.4.3] - 2026-06-28

### Added

- **Sessions filtering + pagination (server-side).** The sessions list and `GET /v1/sessions` now filter by **user, agent, model, and date range** and page with a cursor. New `sessionStats(ids)` rolls up event count, models, and tokens from a session's events. The Sessions page gets a filter bar, an **Events** column, and a "Load more" button.

### Fixed

- **Model column showed nothing until a session ended.** The list derived model(s)/tokens only from the post-finalize summary; it now derives them from the session's `model_use` **events**, so the model appears as soon as it's captured (live for Cursor, at finalize for Claude Code).

---

## [0.4.2] - 2026-06-28

### Fixed

- **Sessions no longer record empty.** Events were buffered locally and only POSTed on the `Stop` / `SessionEnd` hooks, so any session where those didn't fire (some desktop flows, a killed session, or a server restart between `SessionStart` and `Stop`) appeared created-but-empty. `record` now posts buffered events incrementally - messages and tool calls land as they happen, and capture no longer depends on `Stop`/`SessionEnd`.

---

## [0.4.1] - 2026-06-27

### Fixed

- **Cursor sessions now record.** The recorder opened the server-side session only on `session_start`, but Cursor doesn't fire that before the first prompt the way Claude Code does - so Cursor prompts were buffered locally and never opened a session (`flush: no session id yet - session start may have failed`). Sessions are now created **lazily on the first hook event of any kind**, and a failed create releases its claim so the next event retries.

### Added

- **`install-hooks` auto-detects installed agents.** With no `--agent`, it now wires **every** agent present on the machine in one run (`~/.claude` -> Claude Code, `~/.cursor` -> Cursor); `--agent <id>` still targets just one. The double-capture warning no longer fires spuriously when run from `$HOME` (where user and project scope resolve to the same file).

---

## [0.4.0] - 2026-06-26

### Added

- **`wrud cleanup`** (alias `uninstall`) - removes everything wrud installed and undoes `install-hooks`: the local data dir (`~/.wrud`: db, admin + ingest tokens, `hooks.log`), the temp session buffers, and wrud's hook entries from every supported agent's settings (user + project scope). Shared config is edited surgically - only wrud's own hooks are stripped, and an install-created file that empties is deleted. `--dry-run` previews the plan; confirms before deleting unless `--yes`.

### Changed

- **Default ports moved off the common `8787`/`5173`.** The API/server now defaults to `11190` (was `8787`) and the dev dashboard to `11191` (was `5173`; Vite preview `11192`). Override with `WRUD_PORT` / `WRUD_WEB_PORT`. In production (`npx @wrud/cli`) the dashboard is still served same-origin on the API port.

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
