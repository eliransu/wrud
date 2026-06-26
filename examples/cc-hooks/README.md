# wrud - Claude Code hooks (full capture)

This is the integration we run on wrud itself. It records a Claude Code conversation as **one**
wrud session with full fidelity - prompts, tool calls with content, assistant responses, and
token/model usage - then summarizes it when the conversation ends.

## How it maps to hooks

| Hook               | Script        | Does                                                                                  |
| ------------------ | ------------- | ------------------------------------------------------------------------------------- |
| `SessionStart`     | `record.mjs`  | Creates one wrud session (status `open`), persists its id. One network call.          |
| `UserPromptSubmit` | `record.mjs`  | Buffers your prompt to a per-session file. No network.                                |
| `PostToolUse`      | `record.mjs`  | Buffers each tool call (input + response, capped). No network.                        |
| `Stop`             | `flush.mjs`   | Records the assistant's reply (`last_assistant_message`) and flushes the buffer live. |
| `SessionEnd`       | `finalize.ts` | Pulls token/model usage from the transcript **once**, replays the buffer, summarizes. |

Why this split: lifecycle hooks are well-documented and portable, but they don't carry token
usage. So everything except tokens comes from hooks; tokens are read once from the transcript
JSONL at `SessionEnd` (deduped by message id, cache-aware). Nothing blocks Claude Code - the
buffering hooks do no network, and the finalizer is backgrounded.

## Wire it up

`record.mjs` and `flush.mjs` are plain Node; `finalize.ts` runs under `tsx` (it imports
`@wrud/sdk`). Replace `/abs/path/wrud` with your checkout path, and set `WRUD_API_KEY` (an
`ingest`-scoped key - generate one in the dashboard or with `npm run seed:key`).

```jsonc
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /abs/path/wrud/examples/cc-hooks/record.mjs",
          },
        ],
      },
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /abs/path/wrud/examples/cc-hooks/record.mjs",
          },
        ],
      },
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /abs/path/wrud/examples/cc-hooks/record.mjs",
          },
        ],
      },
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /abs/path/wrud/examples/cc-hooks/flush.mjs",
          },
        ],
      },
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx /abs/path/wrud/examples/cc-hooks/finalize.ts &",
          },
        ],
      },
    ],
  },
}
```

Set the environment for those hook processes (e.g. via your shell profile or the hook's `env`):

```bash
export WRUD_BASE_URL="http://localhost:8787"   # default; override if your server is elsewhere
export WRUD_API_KEY="wrud_sk_local_..."          # ingest-scoped key
```

## Notes

- **Idempotent.** Events dedup on `(sessionId, seq)`, so a re-fired hook never double-counts.
- **Safe by design.** Every hook swallows its own errors - wrud never throws into Claude Code.
- **Content, capped.** Tool inputs/outputs and messages are captured but truncated per field
  (6 KB) so a single huge payload can't bloat a session.
- **`lib.mjs`** is shared helper code (`bufferToEvents`, `transcriptToUsage`) used by `flush.mjs`
  and `finalize.ts`; it isn't a hook itself.
- Prefer the simplest possible wiring? See [`../claude-code-hook.ts`](../claude-code-hook.ts) -
  one SDK-based file that records tool calls and summarizes, without token capture.
