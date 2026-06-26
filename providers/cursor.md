# wrud + Cursor

wrud records a Cursor session via Cursor's Hooks (Cursor 1.7+). No API key; everything runs
locally.

## Copy this to Cursor (Agent)

```text
Set up wrud for me - a local-first recorder for AI-agent sessions.

1. Run `npx @wrud/cli` in the BACKGROUND (it's a long-running server - don't block on it).
   When you see the "wrud is running" banner, tell me the `wrud_sk_local_...` token it printed
   and confirm http://localhost:11190 is reachable. It opens the dashboard in my browser.
2. Tell me to paste that token on the dashboard's Connect screen.
3. Run `npx @wrud/cli install-hooks --agent cursor --user`. It mints a least-privilege ingest
   key, writes the hooks into ~/.cursor/hooks.json (all my projects), and self-verifies.
   Use --project instead for just this repo.
4. Tell me to reload Cursor so it picks up the new ~/.cursor/hooks.json, then run
   `npx @wrud/cli doctor` and show me the result.
5. Keep my wrud token out of anything that gets committed or shared.
```

## What gets wired

`install-hooks --agent cursor` writes these to `~/.cursor/hooks.json` (user) or
`.cursor/hooks.json` (project), `version: 1`:

| Cursor event                                                                 | wrud hook  |
| ---------------------------------------------------------------------------- | ---------- |
| `sessionStart`, `beforeSubmitPrompt`, `afterFileEdit`, `afterShellExecution` | `record`   |
| `afterAgentResponse`                                                         | `flush`    |
| `sessionEnd`                                                                 | `finalize` |

Captures prompts, file edits, shell commands, and assistant responses. Cursor reports the model
name on every hook, so model usage and per-model call counts are recorded. Token/cost numbers are
not yet available for Cursor (its transcript format isn't documented) - the rest of the session
records fully. Summaries use a local narrator (`WRUD_NARRATOR_CMD`, default `claude`) when present,
else a deterministic summary.
