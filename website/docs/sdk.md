---
sidebar_position: 3
title: SDK
---

# SDK

`@wrud/sdk` is the small TypeScript client that records sessions to a wrud server. The CLI hooks use it under the hood — so for recording **agent** sessions you normally just run [`install-hooks`](./cli#wrud-install-hooks) and never touch the SDK directly.

Reach for the SDK when you want to record **your own** automation (a script, a CI job, a custom agent) as a wrud session.

:::note
The SDK currently ships inside `@wrud/cli` and lives in the [wrud repo](https://github.com/eliransu/wrud) — it isn't published as a standalone npm package yet. Use it from a clone of the repo for now.
:::

## Client

```ts
import { createWrudClient } from "@wrud/sdk";

const client = createWrudClient({
  baseUrl: "http://localhost:11190", // default; your running wrud server
  apiKey: process.env.WRUD_API_KEY!, // an ingest-scoped token
});
```

| Option    | Default                  | Purpose                                   |
| --------- | ------------------------ | ----------------------------------------- |
| `baseUrl` | `http://localhost:11190` | wrud server URL                           |
| `apiKey`  | —                        | API token (needs `ingest` scope to write) |
| `flushAt` | `50`                     | buffer size before an automatic flush     |
| `fetch`   | global `fetch`           | injectable for tests                      |

## Recording a session

```ts
const session = await client.startSession({
  user: { id: "me" },
  agent: { name: "my-script" },
  runtime: { os: process.platform, cwd: process.cwd() },
});

session.event({ type: "user_message", role: "user", text: "build the report" });
session.event({
  type: "tool_call",
  name: "Bash",
  input: "npm run report",
  ok: true,
});
session.event({ type: "model_use", model: "claude-opus-4-8", calls: 3 });

// write a plain-language recap + insights (lessons, right-sizing)
await session.summarize({ mode: "client" }); // or { mode: "server" }
```

- `client.startSession(opts)` → opens a session, returns a handle.
- `client.resumeSession(id)` → reattach to an existing session id.
- `session.event({ type, ...payload })` → append one event (buffered, flushed in batches).
- `session.summarize({ mode })` → finalize: `"client"` summarizes locally via your narrator; `"server"` summarizes on the server.

Event shapes (`user_message`, `tool_call`, `model_use`, `assistant_message`, …) are defined by the shared Zod contract — see the [HTTP API](./api) for the wire format.
