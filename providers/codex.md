# wrud + OpenAI Codex CLI

wrud records Codex CLI turn-complete notifications through Codex's `notify` command setting.
Codex currently exposes a notification hook rather than the full lifecycle events available in
Claude Code or Cursor, so this provider flushes completed turns and captures the metadata Codex
passes on stdin.

## Copy this to Codex CLI

```text
Set up wrud for me - a local-first recorder for AI-agent sessions.

1. Run `npx @wrud/cli` in the BACKGROUND (it's a long-running server - don't block on it).
   When the server banner appears, confirm http://localhost:11190 is reachable.
2. Run `npx @wrud/cli install-hooks --agent codex --user` to wire Codex globally.
   Use --project instead to write `.codex/config.toml` for only this repo.
3. Restart Codex CLI so it reloads its config, then run `npx @wrud/cli doctor`.
4. Keep wrud tokens out of commits and shared logs.
```

## What gets wired

`install-hooks --agent codex` adds a `notify` command to `~/.codex/config.toml` (user) or
`.codex/config.toml` (project):

| Codex CLI event                                                      | wrud hook |
| -------------------------------------------------------------------- | --------- |
| turn-complete notification (`agent-turn-complete` / `turn-complete`) | `flush`   |

The installer preserves existing TOML settings and replaces only prior wrud-managed `notify`
commands, so re-running it stays idempotent. Because Codex notification support is coarser than
Claude Code lifecycle hooks, this provider records completed assistant turns when Codex sends the
notification payload; prompt/tool-level capture can be added later if Codex exposes more hooks.
