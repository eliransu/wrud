/**
 * `wrud hook <record|flush|finalize>` - the bundled Claude Code hook logic (no external
 * scripts, no /abs/path placeholders). Design goals from real-world pain:
 *   - LOUD failures: every error is appended to ~/.wrud/hooks.log AND stderr. A recorder that
 *     records nothing while exiting 0 is the worst failure for a data tool, so we never swallow.
 *   - Non-blocking SessionEnd: `finalize` spawns a DETACHED worker and returns immediately, so
 *     closing the conversation never waits on transcript reads or LLM summarization.
 *   - Single-session dedupe: project + user hooks both firing record ONE session, not two.
 *   - Recursion-safe: if WRUD_IN_SUMMARY is set (we're inside the narrator's nested Claude
 *     session) every hook no-ops.
 */
import { createWrudClient } from "@wrud/sdk";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE, LOG_FILE, ensureHome, http, resolveIngestToken } from "./env.js";
import { claudeCliNarrator, isNestedSummaryRun } from "./narrator.js";
import { bufferToEvents, transcriptToUsage } from "./transcript.js";

const CAP = 6000;
const cap = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > CAP ? s.slice(0, CAP) + `...[+${s.length - CAP} chars]` : s;
};
const sanitize = (s: unknown): string =>
  String(s || "default")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 64) || "default";

const dir = join(tmpdir(), "wrud-cc");
const bufPath = (sid: string) => join(dir, `${sid}.ndjson`);
const statePath = (sid: string) => join(dir, `${sid}.state.json`);
const payloadPath = (sid: string) => join(dir, `${sid}.sessionend.json`);

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    ensureHome();
    appendFileSync(LOG_FILE, line);
  } catch {
    /* ignore */
  }
  process.stderr.write(`[wrud] ${msg}\n`);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => resolve(raw));
  });
}

type State = {
  wrudSessionId?: string;
  startedAt?: string;
  flushed?: number;
  lastAssistant?: string;
};
const readState = (sid: string): State =>
  existsSync(statePath(sid))
    ? JSON.parse(readFileSync(statePath(sid), "utf8"))
    : {};
const writeState = (sid: string, s: State) =>
  writeFileSync(statePath(sid), JSON.stringify(s));

/** SessionStart / UserPromptSubmit / PostToolUse -> buffer (and create the session once). */
async function record(p: any): Promise<void> {
  const sid = sanitize(p.session_id);
  mkdirSync(dir, { recursive: true });

  if (p.hook_event_name === "SessionStart") {
    // Single-session dedupe: the FIRST hook layer to atomically create the state file owns
    // session creation; a second layer (project + user both wired) finds it and no-ops.
    let owner = false;
    try {
      writeFileSync(statePath(sid), JSON.stringify({ flushed: 0 }), {
        flag: "wx",
      });
      owner = true;
    } catch {
      owner = false; // another layer already created it
    }
    appendFileSync(
      bufPath(sid),
      JSON.stringify({ t: Date.now(), kind: "start", cwd: p.cwd || "" }) + "\n",
    );
    if (!owner) return; // dedupe: don't open a second wrud session for the same conversation

    const token = resolveIngestToken();
    if (!token) {
      log(
        "SessionStart: no ingest token - run `wrud install-hooks`. Buffering locally only.",
      );
      return;
    }
    const res = await http("POST", "/v1/sessions", token, {
      user: { id: process.env.USER || "claude-code-user" },
      agent: { name: "claude-code" },
      runtime: { os: process.platform, cwd: p.cwd || "" },
      metadata: { ccSession: sid },
    });
    if (res.ok && res.json?.sessionId) {
      writeState(sid, {
        wrudSessionId: res.json.sessionId,
        startedAt: res.json.startedAt,
        flushed: 0,
      });
    } else {
      log(
        `SessionStart: create session FAILED (HTTP ${res.status}${res.error ? " " + res.error : ""}) at ${BASE} - check the token scope (needs ingest). Run \`wrud doctor\`.`,
      );
    }
    return;
  }

  const rec: any = { t: Date.now() };
  if (
    p.hook_event_name === "PreToolUse" ||
    p.hook_event_name === "PostToolUse"
  ) {
    rec.kind = "tool";
    rec.tool = String(p.tool_name || "unknown");
    rec.ok = p.tool_response ? p.tool_response.ok !== false : true;
    rec.input = cap(p.tool_input);
    rec.output = cap(p.tool_response);
  } else if (p.hook_event_name === "UserPromptSubmit") {
    rec.kind = "msg";
    rec.role = "user";
    rec.text = cap(p.prompt);
    rec.chars = String(p.prompt || "").length;
  } else {
    return;
  }
  appendFileSync(bufPath(sid), JSON.stringify(rec) + "\n");
}

/** Stop (end of a turn): record the assistant's reply, flush buffered events to the open session. */
async function flush(p: any): Promise<void> {
  const sid = sanitize(p.session_id);
  if (!existsSync(statePath(sid)) || !existsSync(bufPath(sid))) return;
  const state = readState(sid);
  if (!state.wrudSessionId) {
    log(
      "flush: no wrud session id yet (SessionStart may have failed) - skipping flush.",
    );
    return;
  }
  const token = resolveIngestToken();
  if (!token) return log("flush: no ingest token.");

  const text =
    typeof p.last_assistant_message === "string"
      ? p.last_assistant_message.trim()
      : "";
  if (text && text !== state.lastAssistant) {
    appendFileSync(
      bufPath(sid),
      JSON.stringify({
        t: Date.now(),
        kind: "msg",
        role: "assistant",
        text: cap(text),
        chars: text.length,
      }) + "\n",
    );
    state.lastAssistant = text.slice(0, 200);
  }

  const lines = readFileSync(bufPath(sid), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const events = bufferToEvents(lines).map((d, i) => ({
    id: `${state.wrudSessionId}-${i}`,
    sessionId: state.wrudSessionId,
    seq: i,
    timestamp: new Date(d.t || Date.now()).toISOString(),
    type: d.type,
    payload: d.payload,
  }));
  const toSend = events.slice(state.flushed || 0);
  if (toSend.length) {
    const res = await http(
      "POST",
      `/v1/sessions/${state.wrudSessionId}/events`,
      token,
      { events: toSend },
    );
    if (res.ok) state.flushed = events.length;
    else
      log(
        `flush: append FAILED (HTTP ${res.status}) - ${toSend.length} events not recorded.`,
      );
  }
  writeState(sid, state);
}

/** SessionEnd: detach a worker and return IMMEDIATELY so closing the conversation never blocks. */
function finalize(raw: string, p: any, cliPath: string): void {
  const sid = sanitize(p.session_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(payloadPath(sid), raw);
  // Detached + unref'd: the worker outlives this process; SessionEnd returns now.
  const child = spawn(
    process.execPath,
    [cliPath, "hook", "finalize-worker", payloadPath(sid)],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
}

/** The detached worker: transcript usage -> replay -> LLM (client-mode) summarize -> store. */
async function finalizeWorker(payloadFile: string): Promise<void> {
  if (!existsSync(payloadFile)) return;
  const p = JSON.parse(readFileSync(payloadFile, "utf8"));
  const sid = sanitize(p.session_id);
  const token = resolveIngestToken();
  if (!token) return log("finalize: no ingest token - cannot summarize.");
  if (!existsSync(bufPath(sid))) return log(`finalize: no buffer for ${sid}.`);

  // Pull model + token usage once from the transcript (the only thing hooks don't carry).
  if (p.transcript_path && existsSync(p.transcript_path)) {
    const usage = transcriptToUsage(readFileSync(p.transcript_path, "utf8"));
    if (usage.length)
      appendFileSync(
        bufPath(sid),
        usage.map((r) => JSON.stringify(r)).join("\n") + "\n",
      );
  }

  const lines = readFileSync(bufPath(sid), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const start = lines.find((l: any) => l.kind === "start");
  const state = readState(sid);

  const client = createWrudClient({ baseUrl: BASE, apiKey: token });
  let session;
  if (state.wrudSessionId) {
    session = client.resumeSession(state.wrudSessionId);
  } else {
    session = await client.startSession({
      user: { id: process.env.USER || "claude-code-user" },
      agent: { name: "claude-code" },
      runtime: {
        os: process.platform,
        cwd: start?.cwd || p.cwd || process.cwd(),
      },
      metadata: { ccSession: sid },
    });
  }
  for (const e of bufferToEvents(lines))
    session.event({ type: e.type, ...e.payload });

  // Client-mode summary with the user's Claude Code login as the narrator (LLM), recursion-guarded
  // inside claudeCliNarrator. Falls back to the deterministic narrative if `claude` isn't usable.
  try {
    const summary = await session.summarize({
      mode: "client",
      narrator: claudeCliNarrator,
    });
    log(
      `finalize: summarized ${session.sessionId} (${summary.stats.eventCount} events, ${summary.insights.length} insight(s), narrative via ${summary.summarizerVersion}).`,
    );
  } catch (e) {
    // Last resort: server-side deterministic summary so the session still finalizes.
    try {
      await session.summarize({ mode: "server" });
      log(
        `finalize: client summary failed (${e instanceof Error ? e.message : e}); finalized server-side instead.`,
      );
    } catch (e2) {
      log(
        `finalize: summarize FAILED entirely (${e2 instanceof Error ? e2.message : e2}).`,
      );
      return;
    }
  }
  rmSync(bufPath(sid), { force: true });
  rmSync(statePath(sid), { force: true });
  rmSync(payloadFile, { force: true });
}

export async function runHook(sub: string, cliPath: string): Promise<void> {
  // Inside the narrator's nested Claude Code session - never record (would loop / double-count).
  if (isNestedSummaryRun()) return;
  try {
    if (sub === "finalize-worker") {
      const payloadFile = process.argv[4]; // `wrud hook finalize-worker <payloadFile>`
      if (payloadFile) await finalizeWorker(payloadFile);
      return;
    }
    const raw = await readStdin();
    const p = JSON.parse(raw || "{}");
    if (sub === "record") await record(p);
    else if (sub === "flush") await flush(p);
    else if (sub === "finalize") finalize(raw, p, cliPath);
    else log(`unknown hook subcommand: ${sub}`);
  } catch (e) {
    log(`hook ${sub} error: ${e instanceof Error ? e.message : e}`);
  }
}
