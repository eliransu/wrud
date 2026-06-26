/**
 * `wrud hook <record|flush|finalize> [--provider <id>]` - the bundled hook logic (no external
 * scripts). Provider-agnostic: a raw agent payload is normalized via the provider registry, then
 * handled by kind. Design goals from real-world pain:
 *   - LOUD failures: every error -> ~/.wrud/hooks.log AND stderr (never silently record nothing).
 *   - Non-blocking finalize: a DETACHED worker does transcript reads + summarization, so closing
 *     the conversation never waits.
 *   - Single-session dedupe: project + user hooks both firing record ONE session.
 *   - Recursion-safe: if WRUD_IN_SUMMARY is set (inside the narrator's nested session), no-op.
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
import { cliNarrator, isNestedSummaryRun } from "./narrator.js";
import { bufferToEvents, transcriptToUsage } from "./transcript.js";
import {
  getProvider,
  type NormalizedHook,
  type ProviderSpec,
} from "./providers.js";

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

const dir = join(tmpdir(), "wrud-sessions");
const bufPath = (sid: string) => join(dir, `${sid}.ndjson`);
const statePath = (sid: string) => join(dir, `${sid}.state.json`);
const payloadPath = (sid: string) => join(dir, `${sid}.sessionend.json`);

function log(msg: string): void {
  try {
    ensureHome();
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
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
  providerId?: string;
  agentName?: string;
  model?: string; // captured from hooks when the agent reports it on the payload
  assistantTurns?: number;
};
const readState = (sid: string): State =>
  existsSync(statePath(sid))
    ? JSON.parse(readFileSync(statePath(sid), "utf8"))
    : {};
const writeState = (sid: string, s: State) =>
  writeFileSync(statePath(sid), JSON.stringify(s));

/** session_start -> create one session; user_prompt / tool_use -> buffer content. */
async function record(
  h: NormalizedHook,
  provider: ProviderSpec,
): Promise<void> {
  const sid = sanitize(h.sessionId);
  mkdirSync(dir, { recursive: true });

  if (h.kind === "session_start") {
    // Single-session dedupe: the FIRST layer to atomically create the state file owns creation.
    let owner = false;
    try {
      writeFileSync(
        statePath(sid),
        JSON.stringify({
          flushed: 0,
          providerId: provider.id,
          agentName: provider.agentName,
          model: h.model,
        }),
        { flag: "wx" },
      );
      owner = true;
    } catch {
      owner = false;
    }
    appendFileSync(
      bufPath(sid),
      JSON.stringify({ t: Date.now(), kind: "start", cwd: h.cwd || "" }) + "\n",
    );
    if (!owner) return;

    const token = resolveIngestToken();
    if (!token)
      return log(
        "session start: no ingest token - run `wrud install-hooks`. Buffering locally only.",
      );
    const res = await http("POST", "/v1/sessions", token, {
      user: { id: process.env.USER || "user" },
      agent: { name: provider.agentName },
      runtime: { os: process.platform, cwd: h.cwd || "" },
      metadata: { agentSession: sid, provider: provider.id },
    });
    if (res.ok && res.json?.sessionId) {
      writeState(sid, {
        wrudSessionId: res.json.sessionId,
        startedAt: res.json.startedAt,
        flushed: 0,
        providerId: provider.id,
        agentName: provider.agentName,
        model: h.model,
        assistantTurns: 0,
      });
    } else {
      log(
        `session start: create FAILED (HTTP ${res.status}${res.error ? " " + res.error : ""}) at ${BASE} - check token scope (needs ingest). Run \`wrud doctor\`.`,
      );
    }
    return;
  }

  const rec: any = { t: Date.now() };
  if (h.kind === "tool_use") {
    rec.kind = "tool";
    rec.tool = String(h.toolName || "unknown");
    rec.ok = h.ok !== false;
    rec.input = cap(h.toolInput);
    rec.output = cap(h.toolOutput);
  } else if (h.kind === "user_prompt") {
    rec.kind = "msg";
    rec.role = "user";
    rec.text = cap(h.prompt);
    rec.chars = String(h.prompt || "").length;
  } else {
    return;
  }
  appendFileSync(bufPath(sid), JSON.stringify(rec) + "\n");
  if (h.model) {
    // remember the model the agent reported, for finalize when there's no token transcript
    const st = readState(sid);
    if (!st.model) writeState(sid, { ...st, model: h.model });
  }
}

/** assistant_msg -> record the reply text and flush buffered events to the open session. */
async function flush(
  h: NormalizedHook,
  _provider: ProviderSpec,
): Promise<void> {
  if (h.kind !== "assistant_msg") return;
  const sid = sanitize(h.sessionId);
  if (!existsSync(statePath(sid)) || !existsSync(bufPath(sid))) return;
  const state = readState(sid);
  if (!state.wrudSessionId)
    return log(
      "flush: no session id yet (session start may have failed) - skipping.",
    );
  const token = resolveIngestToken();
  if (!token) return log("flush: no ingest token.");

  const text =
    typeof h.assistantText === "string" ? h.assistantText.trim() : "";
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
    state.assistantTurns = (state.assistantTurns || 0) + 1;
  }
  if (h.model && !state.model) state.model = h.model;

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

/** session_end -> detach a worker and return IMMEDIATELY so closing the conversation never blocks. */
function finalize(
  raw: string,
  h: NormalizedHook,
  provider: ProviderSpec,
  cliPath: string,
): void {
  const sid = sanitize(h.sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(payloadPath(sid), raw);
  const child = spawn(
    process.execPath,
    [
      cliPath,
      "hook",
      "finalize-worker",
      payloadPath(sid),
      "--provider",
      provider.id,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

/** The detached worker: usage (transcript or agent-reported model) -> replay -> summarize -> store. */
async function finalizeWorker(
  payloadFile: string,
  provider: ProviderSpec,
): Promise<void> {
  if (!existsSync(payloadFile)) return;
  const raw = JSON.parse(readFileSync(payloadFile, "utf8"));
  const h = provider.normalize(raw);
  const sid = sanitize(h.sessionId);
  const token = resolveIngestToken();
  if (!token) return log("finalize: no ingest token - cannot summarize.");
  if (!existsSync(bufPath(sid))) return log(`finalize: no buffer for ${sid}.`);
  const state = readState(sid);

  // Token/model usage: from the transcript when the agent exposes a parseable one; otherwise fall
  // back to the model the agent reported on hooks, with a call count but no tokens.
  let usage =
    h.transcriptPath && existsSync(h.transcriptPath)
      ? transcriptToUsage(readFileSync(h.transcriptPath, "utf8"))
      : [];
  if (usage.length === 0 && state.model) {
    usage = [
      {
        t: Date.now(),
        kind: "model",
        model: state.model,
        inputTokens: 0,
        outputTokens: 0,
        calls: state.assistantTurns || 1,
      },
    ];
  }
  if (usage.length)
    appendFileSync(
      bufPath(sid),
      usage.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );

  const lines = readFileSync(bufPath(sid), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const start = lines.find((l: any) => l.kind === "start");
  const agentName = state.agentName || provider.agentName;

  const client = createWrudClient({ baseUrl: BASE, apiKey: token });
  let session;
  if (state.wrudSessionId) {
    session = client.resumeSession(state.wrudSessionId);
  } else {
    session = await client.startSession({
      user: { id: process.env.USER || "user" },
      agent: { name: agentName },
      runtime: {
        os: process.platform,
        cwd: start?.cwd || h.cwd || process.cwd(),
      },
      metadata: { agentSession: sid, provider: provider.id },
    });
  }
  for (const e of bufferToEvents(lines))
    session.event({ type: e.type, ...e.payload });

  // Client-mode summary via the local narrator (best-effort), recursion-guarded inside cliNarrator.
  try {
    const summary = await session.summarize({
      mode: "client",
      narrator: cliNarrator,
    });
    log(
      `finalize: summarized ${session.sessionId} (${summary.stats.eventCount} events, ${summary.insights.length} insight(s), via ${summary.summarizerVersion}).`,
    );
  } catch (e) {
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

const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

export async function runHook(sub: string, cliPath: string): Promise<void> {
  if (isNestedSummaryRun()) return; // inside the narrator's nested session - never record
  const provider = getProvider(argVal("--provider"));
  try {
    if (sub === "finalize-worker") {
      const payloadFile = process.argv[4];
      if (payloadFile) await finalizeWorker(payloadFile, provider);
      return;
    }
    const raw = await readStdin();
    const payload = JSON.parse(raw || "{}");
    const h = provider.normalize(payload);
    if (sub === "record") await record(h, provider);
    else if (sub === "flush") await flush(h, provider);
    else if (sub === "finalize") finalize(raw, h, provider, cliPath);
    else log(`unknown hook subcommand: ${sub}`);
  } catch (e) {
    log(`hook ${sub} error: ${e instanceof Error ? e.message : e}`);
  }
}
