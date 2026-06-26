// wrud Claude Code hook - runs on Stop (end of each turn). Two jobs:
//  1. Record the assistant's response text from the hook payload's `last_assistant_message`
//     (no transcript parsing - hooks carry this directly now).
//  2. Flush not-yet-sent events to the OPEN session so it populates live.
// Token/model usage is NOT captured here - that's pulled once at SessionEnd (finalize).
// Non-blocking, idempotent (server dedups on (sessionId, seq)). Env: WRUD_BASE_URL, WRUD_API_KEY.
import { readFileSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { bufferToEvents } from "./lib.mjs";

const BASE = process.env.WRUD_BASE_URL || "http://localhost:8787";
const KEY = process.env.WRUD_API_KEY;
const sanitize = (s) => String(s || "default").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "default";
const CAP = 8000;
const cap = (s) => (s && s.length > CAP ? s.slice(0, CAP) + "..." : s);

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", async () => {
  try {
    if (!KEY) return;
    const p = JSON.parse(raw || "{}");
    const sid = sanitize(p.session_id);
    const dir = join(tmpdir(), "wrud-cc");
    const bufFile = join(dir, `${sid}.ndjson`);
    const stateFile = join(dir, `${sid}.state.json`);
    if (!existsSync(stateFile) || !existsSync(bufFile)) return;
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    if (!state.wrudSessionId) return;

    // 1) record the assistant's final response text for this turn (from the hook payload)
    const text = typeof p.last_assistant_message === "string" ? p.last_assistant_message.trim() : "";
    if (text && text !== state.lastAssistant) {
      appendFileSync(bufFile, JSON.stringify({ t: Date.now(), kind: "msg", role: "assistant", text: cap(text), chars: text.length }) + "\n");
      state.lastAssistant = text.slice(0, 200); // cheap dedup guard across Stops
    }

    // 2) flush not-yet-sent events to the open session
    const lines = readFileSync(bufFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const events = bufferToEvents(lines).map((d, i) => ({
      id: randomUUID(),
      sessionId: state.wrudSessionId,
      seq: i,
      timestamp: new Date(d.t || Date.now()).toISOString(),
      type: d.type,
      payload: d.payload,
    }));
    const toSend = events.slice(state.flushed || 0);
    if (toSend.length > 0) {
      const res = await fetch(`${BASE}/v1/sessions/${state.wrudSessionId}/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ events: toSend }),
      });
      if (res.ok) state.flushed = events.length;
    }
    writeFileSync(stateFile, JSON.stringify(state));
  } catch {
    // never throw into the host agent
  }
});
