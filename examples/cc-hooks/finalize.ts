// wrud Claude Code hook - SessionEnd finalizer. Runs ONCE at true conversation end:
// resumes the session created at SessionStart (one wrud session per conversation), replays
// the buffered events into it, and summarizes (server mode by default). Backgrounded by the
// hook command, so it never blocks Claude Code shutdown.
// Env: WRUD_BASE_URL (default http://localhost:8787), WRUD_API_KEY (ingest scope).
import { readFileSync, existsSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir, userInfo, platform } from "node:os";
import { join } from "node:path";
import { createWrudClient } from "@wrud/sdk";
import { bufferToEvents, transcriptToUsage } from "./lib.mjs";

const BASE = process.env.WRUD_BASE_URL ?? "http://localhost:8787";
const KEY = process.env.WRUD_API_KEY ?? "";
const sanitize = (s: string) =>
  String(s || "default")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 64) || "default";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", async () => {
  try {
    if (!KEY) {
      console.error("[wrud] WRUD_API_KEY not set - skipping");
      return;
    }
    const p = JSON.parse(raw || "{}");
    const sid = sanitize(p.session_id);
    const dir = join(tmpdir(), "wrud-cc");
    const bufFile = join(dir, `${sid}.ndjson`);
    const stateFile = join(dir, `${sid}.state.json`);
    if (!existsSync(bufFile)) {
      console.error("[wrud] no buffered events for session", sid);
      return;
    }

    const state = existsSync(stateFile)
      ? JSON.parse(readFileSync(stateFile, "utf8"))
      : {};

    // Pull model + token usage ONCE from the transcript - the only thing hooks don't carry.
    // Deduped by message id + cache-aware (see transcriptToUsage). Assistant text already came
    // from the Stop hook's last_assistant_message, so we do NOT parse text here.
    if (p.transcript_path && existsSync(p.transcript_path)) {
      const usage = transcriptToUsage(readFileSync(p.transcript_path, "utf8"));
      if (usage.length)
        appendFileSync(
          bufFile,
          usage.map((r: unknown) => JSON.stringify(r)).join("\n") + "\n",
        );
    }

    const lines = readFileSync(bufFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const start = lines.find((l: any) => l.kind === "start");

    const client = createWrudClient({ baseUrl: BASE, apiKey: KEY });
    // Resume the session created at SessionStart; only create one if that's missing (offline start).
    let session;
    if (state.wrudSessionId) {
      session = client.resumeSession(state.wrudSessionId);
    } else {
      session = await client.startSession({
        user: { id: userInfo().username || "claude-code-user" },
        agent: { name: "claude-code" },
        runtime: { os: platform(), cwd: start?.cwd || p.cwd || process.cwd() },
        metadata: { ccSession: sid },
      });
    }

    // Replay every buffered event (tool calls, user + assistant messages, model usage).
    // Already-sent events dedup on (sessionId, seq); the rest land before summarize.
    for (const e of bufferToEvents(lines))
      session.event({ type: e.type, ...e.payload });

    const summary = await session.summarize(); // server mode (default)
    rmSync(bufFile, { force: true });
    rmSync(stateFile, { force: true });
    console.log(
      `[wrud] finalized session ${session.sessionId}: ${summary.stats.eventCount} events, ${summary.insights.length} insight(s)`,
    );
  } catch (e) {
    console.error("[wrud finalize]", e instanceof Error ? e.message : e);
  }
});
