---
sidebar_position: 2
title: CLI
---

# CLI

The `wrud` CLI (`@wrud/cli`) is both the **viewer** (server + dashboard) and the **installer** (agent hooks). Run it with `npx @wrud/cli <command>`.

## Commands

### `wrud` (default)

Start the server + dashboard on one origin (default `http://localhost:11190`), seed a local admin token, open your browser, and print the token. If a wrud server is already running on the port, it **attaches** instead of failing.

```bash
npx @wrud/cli
```

### `wrud install-hooks`

Wire your agent(s) so their sessions record. With **no `--agent`, it auto-detects every agent present on the machine** (`~/.claude` → Claude Code, `~/.cursor` → Cursor) and wires all of them. It mints a least-privilege ingest token and self-verifies with `doctor`.

```bash
npx @wrud/cli install-hooks                 # wire everything you have
npx @wrud/cli install-hooks --agent cursor  # wire just one
npx @wrud/cli install-hooks --project       # project scope instead of user scope
```

> Restart your agent afterwards — hooks load at launch.

### `wrud doctor`

Prove the capture path works end-to-end against the configured server + token (PASS/FAIL + HTTP status for create → append → summarize).

```bash
npx @wrud/cli doctor
```

### `wrud cleanup` (alias `uninstall`)

Remove everything wrud installed and undo `install-hooks`: the data dir `~/.wrud` (db, tokens, log), the temp session buffers, and wrud's hook entries from every agent's settings (user + project). Shared config is edited **surgically** — only wrud's own hooks are stripped; an install-created file that empties is deleted.

```bash
npx @wrud/cli cleanup --dry-run   # preview the plan, change nothing
npx @wrud/cli cleanup --yes       # remove without the confirmation prompt
```

### `wrud hook <record|flush|finalize>`

Internal — invoked **by your agent's hook config**, not by hand. Reads the agent's hook payload from stdin, normalizes it, and records it. Takes `--provider <id>`.

## Environment

| Var                  | Default                      | Purpose                                                                            |
| -------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `WRUD_PORT`          | `11190`                      | API/server port (dashboard served same-origin)                                     |
| `WRUD_WEB_PORT`      | `11191`                      | Dev dashboard port (Vite)                                                          |
| `WRUD_DB`            | `~/.wrud/wrud.db`            | SQLite database path                                                               |
| `WRUD_BASE_URL`      | `http://localhost:11190`     | Base URL the hooks/CLI talk to                                                     |
| `WRUD_API_KEY`       | —                            | Ingest token override (else read from `~/.wrud`)                                   |
| `WRUD_NARRATOR_CMD`  | `claude`                     | CLI used for the plain-language recap (runs on your agent's own login; no API key) |
| `WRUD_ANTHROPIC_KEY` | —                            | Use the Anthropic API for the recap instead of the local narrator                  |
| `WRUD_CORS_ORIGIN`   | `http://localhost:11191,...` | Allowed browser origins (comma-separated)                                          |
