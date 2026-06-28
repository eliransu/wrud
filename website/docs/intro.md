---
slug: /
sidebar_position: 1
title: Getting started
---

# wrud

**What R U Doing** — a local-first, open-source recorder for AI coding-agent sessions.

Your agent runs for an hour, changes dozens of files, spends real money, picks its own model — then the session scrolls off and is gone. wrud records every session (tools, models, tokens, cost, file edits, prompts), writes a plain-language recap, and turns recurring mistakes into lessons you feed back. Runs entirely on your machine — no cloud, no account, nothing leaves your box.

Works with **Claude Code** and **Cursor** via their own lifecycle hooks.

## Install & run

```bash
npx @wrud/cli
```

This starts the API + dashboard on one origin (default `http://localhost:11190`), seeds a local API key, opens your browser, and prints a token to paste on the **Connect** screen.

`npx @wrud/cli` is just the **viewer/server** — it doesn't record anything by itself. Recording is done by your agent's **hooks**, which you wire once:

```bash
# auto-detects every agent you have (Claude Code, Cursor, ...) and wires all of them
npx @wrud/cli install-hooks

# verify the capture path works end-to-end
npx @wrud/cli doctor
```

Then **restart your agent** (it loads hooks at launch) and work as usual — sessions stream into the dashboard automatically.

## How it works

1. **Hooks fire** — your agent's lifecycle hooks stream prompts, tool calls, file edits and replies as they happen.
2. **Land locally** — events hit a local server and one SQLite file at `~/.wrud/wrud.db`. Nothing leaves your machine.
3. **Recap** — a background worker reads the models, tokens and dollars and writes a plain-language summary.
4. **Feed back** — recurring mistakes surface as **lessons** you hand back to the agent.

## Next

- **[CLI](./cli)** — every command and environment variable
- **[SDK](./sdk)** — record from your own code with `@wrud/sdk`
- **[HTTP API](./api)** — the local REST API
- **[Providers](./providers)** — supported agents and how hooks map
