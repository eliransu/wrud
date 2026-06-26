// wrud Claude Code hook - NON-BLOCKING recorder.
//  - SessionStart: create ONE wrud session now (status open), persist its id (network, once).
//  - PostToolUse / UserPromptSubmit: append a content line to the per-session buffer (no network).
// The SessionEnd hook (finalize.ts) replays the buffer into that one session and summarizes.
// Captures real CONTENT, capped per field. Never throws into the host agent.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CAP = 6000;
const cap = (v) => {
  if (v == null) return undefined;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > CAP ? s.slice(0, CAP) + `...[+${s.length - CAP} chars]` : s;
};
const sanitize = (s) => String(s || "default").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "default";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", async () => {
  try {
    const p = JSON.parse(raw || "{}");
    const sid = sanitize(p.session_id);
    const dir = join(tmpdir(), "wrud-cc");
    mkdirSync(dir, { recursive: true });
    const bufFile = join(dir, `${sid}.ndjson`);
    const stateFile = join(dir, `${sid}.state.json`);

    if (p.hook_event_name === "SessionStart") {
      // Create the wrud session once, at the start of the conversation.
      const KEY = process.env.WRUD_API_KEY;
      const BASE = process.env.WRUD_BASE_URL || "http://localhost:8787";
      if (KEY) {
        try {
          const res = await fetch(`${BASE}/v1/sessions`, {
            method: "POST",
            headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
            body: JSON.stringify({
              user: { id: process.env.USER || "claude-code-user" },
              agent: { name: "claude-code" },
              runtime: { os: process.platform, cwd: p.cwd || "" },
              metadata: { ccSession: sid },
            }),
          });
          if (res.ok) {
            const j = await res.json();
            writeFileSync(stateFile, JSON.stringify({ wrudSessionId: j.sessionId, startedAt: j.startedAt, flushed: 0 }));
          }
        } catch {
          // offline / server down - finalize will fall back to creating the session at the end
        }
      }
      appendFileSync(bufFile, JSON.stringify({ t: Date.now(), kind: "start", cwd: p.cwd || "" }) + "\n");
      return;
    }

    const rec = { t: Date.now() };
    if (p.hook_event_name === "PreToolUse" || p.hook_event_name === "PostToolUse") {
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
      return; // ignore other hooks here
    }
    appendFileSync(bufFile, JSON.stringify(rec) + "\n");
  } catch {
    // never throw into the host agent
  }
});
