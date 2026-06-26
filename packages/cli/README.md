# @wrud/cli

**What R U Doing** — a local-first, open-source recorder for AI coding-agent sessions.

Your agent runs for an hour, changes dozens of files, spends real money, picks its own model — then the session scrolls off and is gone. `wrud` records every session (tools, models, tokens, cost, file edits, prompts), writes a plain-language recap, and turns recurring mistakes into lessons you feed back. Runs entirely on your machine — no cloud, no account, nothing leaves your box.

Works with **Claude Code** and **Cursor** via their own lifecycle hooks.

## Quickstart

```bash
npx @wrud/cli
```

Starts the API + dashboard on one origin (default `http://localhost:11190`), seeds a local API key, opens your browser, and prints a token to paste on the **Connect** screen.

Then wire your agent and verify capture end-to-end:

```bash
npx @wrud/cli install-hooks --agent claude-code   # or: --agent cursor
npx @wrud/cli doctor
```

## Commands

| Command                                                                | What it does                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrud`                                                                 | Start the server + dashboard (one origin). Attaches if already running.                                                                                                                                                                  |
| `wrud install-hooks [--agent claude-code\|cursor] [--user\|--project]` | Wire that agent's hooks, mint a least-privilege ingest key, self-verify.                                                                                                                                                                 |
| `wrud doctor`                                                          | Prove the capture path works end-to-end (PASS/FAIL + HTTP status).                                                                                                                                                                       |
| `wrud cleanup` (alias `uninstall`)                                     | Remove everything wrud installed — `~/.wrud` (db, tokens, log), temp session buffers, and wrud's hook entries in every agent's settings (user + project). Edits shared config surgically; `--dry-run` previews; confirms unless `--yes`. |

## Environment

| Var                  | Default                  | Purpose                                                                            |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `WRUD_PORT`          | `11190`                  | API/server port (dashboard is served same-origin)                                  |
| `WRUD_DB`            | `~/.wrud/wrud.db`        | SQLite database path                                                               |
| `WRUD_BASE_URL`      | `http://localhost:11190` | Base URL the hooks/CLI talk to                                                     |
| `WRUD_API_KEY`       | —                        | Ingest token override (else read from `~/.wrud`)                                   |
| `WRUD_NARRATOR_CMD`  | `claude`                 | CLI used for the plain-language recap (runs on your agent's own login; no API key) |
| `WRUD_ANTHROPIC_KEY` | —                        | Optional: use the Anthropic API for the recap instead of the local narrator        |

## Privacy

Local-first by design: a Node server and one SQLite file on your disk. No account, no egress. The summary recap runs in the background on your agent's own login, so there's no extra API key and no extra bill.

## Links

- Source, docs & issues: https://github.com/eliransu/wrud
- License: MIT
