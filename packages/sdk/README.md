# @wrud/sdk

Thin, typed TypeScript client for the [wrud](../../README.md) API - record what an AI agent
did during a session and turn it into a queryable summary. Ships an agnostic client plus a
Claude Code hook adapter (`@wrud/sdk/claude-code`).

**Requirements:** Node >= 20, ESM. You need a running wrud server and an API key with the
`ingest` scope (and `read` if you want to fetch summaries back).

## Install

> **Status:** `@wrud/sdk` is `0.1.0` and is **not published to npm yet**. Use one of the
> local options below until it's published.

**A - Inside this monorepo (today).** It's linked automatically via npm workspaces, so just import it:

```ts
import { createWrudClient } from "@wrud/sdk";
```

**B - From another local project (before publish).** Install the package by path, or pack it:

```bash
# path install
npm install /absolute/path/to/wrud/packages/sdk

# ...or build a tarball and install that
npm pack /absolute/path/to/wrud/packages/sdk   # -> wrud-sdk-0.1.0.tgz
npm install ./wrud-sdk-0.1.0.tgz
```

The package resolves `@wrud/shared` (its only dependency) via the workspace; for a standalone
install you'll also need that package available (path/tarball install both pull it in from the
monorepo).

**C - From npm (after publishing).** Once published:

```bash
npm install @wrud/sdk
```

> Publishing: the package currently points its exports at TypeScript source
> (`./src/index.ts`), which is ideal for the workspace + `tsx`/Vite consumers but not for a
> plain-Node npm consumer. Before `npm publish`, add a build step (e.g. `tsup`) that emits
> `dist/*.js` + `.d.ts` and repoint `exports`/`types`. (Tracked as future work.)

## Usage

```ts
import { createWrudClient } from "@wrud/sdk";

const client = createWrudClient({
  baseUrl: "http://localhost:8787", // default
  apiKey: process.env.WRUD_API_KEY!, // an `ingest`-scoped key
});

const session = await client.startSession({
  user: { id: "alice" },
  agent: { name: "claude-code" },
});

session.event({ type: "tool_call", name: "Edit", ok: true, durationMs: 12 });
session.event({
  type: "model_use",
  model: "claude-opus-4-8",
  outputTokens: 320,
  task: "rename var",
});

const summary = await session.summarize(); // flushes buffered events, returns the summary
```

`event()` is **resilient by contract** - it never throws into your agent. Malformed events are
validated, dropped, and counted (`session.droppedCount`). Events are buffered in memory and
flushed in batches (on a threshold or on `summarize()`).

### Options (`createWrudClient`)

| option    | default                 | meaning                                      |
| --------- | ----------------------- | -------------------------------------------- |
| `baseUrl` | `http://localhost:8787` | wrud server URL                              |
| `apiKey`  | _(required)_            | API key sent as `Authorization: Bearer ...`    |
| `fetch`   | global `fetch`          | inject a custom fetch (used in tests)        |
| `flushAt` | `50`                    | buffer size that triggers an automatic flush |

### Cross-process sessions (`resumeSession`)

When events are produced by separate processes (e.g. one per editor hook), bind to an existing
session and persist the `seq` cursor between invocations so events stay monotonic:

```ts
const handle = client.resumeSession(sessionId, savedNextSeq);
handle.event({ type: "tool_call", name: "Read", ok: true });
await handle.flush();
const nextSeq = handle.nextSeq; // persist this for the next process
```

## Claude Code adapter

`@wrud/sdk/claude-code` maps Claude Code lifecycle-hook payloads to wrud events:

```ts
import { hookPayloadToEvents } from "@wrud/sdk/claude-code";
const events = hookPayloadToEvents(hookJson); // -> WrudEventInput[]
```

A ready-to-wire hook script lives at [`examples/claude-code-hook.ts`](../../examples/claude-code-hook.ts);
see the [root README](../../README.md#claude-code-integration) for the `.claude/settings.json` wiring.
