/**
 * Example Claude Code hook script for wrud. Wire it into `.claude/settings.json` (see the
 * README). Claude Code runs it once per hook event, passing the hook JSON on stdin. It
 * correlates events to one wrud session via a per-session temp file keyed by Claude Code's
 * own `session_id`, and persists the `seq` cursor there so events from separate hook
 * processes stay monotonic (no idempotency collision at seq 0).
 *
 * Run with tsx. Env: WRUD_BASE_URL (default http://localhost:8787), WRUD_API_KEY.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWrudClient } from "@wrud/sdk";
import { hookPayloadToEvents } from "@wrud/sdk/claude-code";

const stateFile = (sid: string) => join(tmpdir(), `wrud-${sid}.json`);

async function main() {
  if (!process.env.WRUD_API_KEY) {
    console.error(
      "[wrud hook] WRUD_API_KEY not set - skipping (recording disabled)",
    );
    return;
  }
  const raw = readFileSync(0, "utf8");
  const payload = JSON.parse(raw) as Record<string, any>;
  // Sanitize the session id before using it in a file path (no traversal / odd chars).
  const rawSession = String(payload.session_id ?? "default");
  const ccSession = /^[A-Za-z0-9_-]{1,64}$/.test(rawSession)
    ? rawSession
    : "default";
  const client = createWrudClient({
    baseUrl: process.env.WRUD_BASE_URL ?? "http://localhost:8787",
    apiKey: process.env.WRUD_API_KEY,
  });
  const file = stateFile(ccSession);

  switch (payload.hook_event_name) {
    case "SessionStart": {
      const session = await client.startSession({
        user: { id: process.env.USER ?? "unknown" },
        agent: { name: "claude-code" },
        runtime: { os: process.platform, cwd: payload.cwd ?? process.cwd() },
        metadata: { ccSession },
      });
      writeFileSync(
        file,
        JSON.stringify({ sessionId: session.sessionId, nextSeq: 0 }),
      );
      break;
    }
    case "Stop":
    case "SessionEnd": {
      if (!existsSync(file)) break;
      const { sessionId } = JSON.parse(readFileSync(file, "utf8"));
      await client.resumeSession(sessionId).summarize();
      rmSync(file, { force: true });
      break;
    }
    default: {
      if (!existsSync(file)) break;
      const state = JSON.parse(readFileSync(file, "utf8"));
      const handle = client.resumeSession(state.sessionId, state.nextSeq);
      for (const ev of hookPayloadToEvents(payload)) handle.event(ev);
      await handle.flush();
      writeFileSync(
        file,
        JSON.stringify({ sessionId: state.sessionId, nextSeq: handle.nextSeq }),
      );
    }
  }
}

main().catch((err) => {
  // Never fail the host agent: log to stderr and exit 0.
  console.error("[wrud hook]", err);
  process.exit(0);
});
