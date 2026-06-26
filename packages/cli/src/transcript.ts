/**
 * Buffer/transcript helpers (ported from examples/cc-hooks/lib.mjs). HOOK-FIRST capture: tool
 * I/O, prompts, and assistant text come from hook payloads; the ONLY thing hooks don't carry -
 * model + token usage - is read once at SessionEnd from the transcript (transcriptToUsage).
 * This is the single agent-specific read, isolated here as a usage enricher (not capture).
 */
interface BufferLine {
  t?: number;
  kind: "start" | "tool" | "msg" | "model";
  tool?: string;
  ok?: boolean;
  input?: unknown;
  output?: unknown;
  role?: string;
  text?: string;
  chars?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cwd?: string;
}

export interface BufferedEvent {
  t: number;
  type: "tool_call" | "message" | "model_use";
  payload: Record<string, unknown>;
}

/** Map buffered records -> events. Drops exact-duplicate payloads (the double-capture footgun:
 * project + user hooks both fire and buffer identical events - collapse them by content). */
export function bufferToEvents(lines: BufferLine[]): BufferedEvent[] {
  const out: BufferedEvent[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    let ev: BufferedEvent | undefined;
    if (l.kind === "tool") {
      ev = {
        t: l.t ?? 0,
        type: "tool_call",
        payload: {
          name: l.tool,
          ok: l.ok !== false,
          input: l.input,
          output: l.output,
        },
      };
    } else if (l.kind === "msg") {
      ev = {
        t: l.t ?? 0,
        type: "message",
        payload: {
          role: l.role || "user",
          chars: l.chars ?? (l.text ? String(l.text).length : 0),
          text: l.text,
        },
      };
    } else if (l.kind === "model") {
      ev = {
        t: l.t ?? 0,
        type: "model_use",
        payload: {
          model: l.model,
          inputTokens: l.inputTokens,
          outputTokens: l.outputTokens,
        },
      };
    }
    if (!ev) continue;
    // Content signature (no timestamp/seq) - identical events from two hook layers collapse.
    const sig = `${ev.type}:${JSON.stringify(ev.payload)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(ev);
  }
  return out;
}

/**
 * Extract model + token usage from a Claude Code transcript - deduped by message id, cache-aware
 * (input = input + cache_creation + cache_read). One model record per unique assistant message.
 */
export function transcriptToUsage(transcriptText: string): BufferLine[] {
  const lines = transcriptText.split("\n").filter(Boolean);
  const byId = new Map<string, BufferLine>();
  for (const raw of lines) {
    let e: any;
    try {
      e = JSON.parse(raw);
    } catch {
      continue;
    }
    const m = e.message;
    if (!m || m.role !== "assistant" || !m.usage) continue;
    const u = m.usage;
    const input =
      (u.input_tokens || 0) +
      (u.cache_creation_input_tokens || 0) +
      (u.cache_read_input_tokens || 0);
    const output = u.output_tokens || 0;
    const id = m.id || `${m.model}:${input}:${output}`;
    const prev = byId.get(id);
    if (!prev || output >= (prev.outputTokens ?? 0)) {
      byId.set(id, {
        t: Date.now(),
        kind: "model",
        model: m.model || "unknown",
        inputTokens: input,
        outputTokens: output,
      });
    }
  }
  return [...byId.values()];
}
