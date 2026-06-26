# wrud + Claude Code

wrud records a Claude Code session via Claude Code's lifecycle hooks. No API key; everything
runs locally.

## Copy this to Claude Code

```text
Set up wrud for me - a local-first recorder for AI-agent sessions.

1. Run `npx @wrud/cli` in the BACKGROUND (it's a long-running server - don't block on it).
   When you see the "wrud is running" banner, tell me the `wrud_sk_local_...` token it printed
   and confirm http://localhost:8787 is reachable. It opens the dashboard in my browser.
2. Tell me to paste that token on the dashboard's Connect screen.
3. Run `npx @wrud/cli install-hooks --agent claude-code --user`. It mints a least-privilege
   ingest key, wires the hooks into ~/.claude/settings.json (all my projects), and self-verifies.
   Use --project instead for just this repo.
4. Run `npx @wrud/cli doctor` and show me the result.
6. Keep my wrud token out of anything that gets committed or shared.
```

## What gets wired

`install-hooks --agent claude-code` adds these to `~/.claude/settings.json` (user) or
`.claude/settings.json` (project):

| Claude Code event                                 | wrud hook  |
| ------------------------------------------------- | ---------- |
| `SessionStart`, `UserPromptSubmit`, `PostToolUse` | `record`   |
| `Stop`                                            | `flush`    |
| `SessionEnd`                                      | `finalize` |

Captures prompts, tool calls with content, assistant responses, and token/model usage (read once
from the transcript at session end). On finalize a detached, non-blocking worker summarizes the
session with a local narrator (`claude -p`, configurable via `WRUD_NARRATOR_CMD`), falling back to
a deterministic summary if it isn't available.
