/**
 * Buffer/transcript helpers. HOOK-FIRST capture: tool I/O, prompts, and assistant text all come
 * from hook payloads. The ONLY thing some agents' hooks don't carry - model + token usage - is
 * read once at session end from the transcript (transcriptToUsage), isolated here as an optional
 * usage enricher, not the capture path.
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
  calls?: number;
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
          calls: l.calls ?? 1,
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
 * Extract model + token usage from an agent transcript (Anthropic-style usage records). Two passes:
 *   1. dedup by message id, cache-aware (input = input + cache_creation + cache_read), keeping
 *      the most-complete sighting of each assistant message (streaming logs partials first);
 *   2. AGGREGATE per model into ONE record carrying summed tokens + a `calls` count.
 * This collapses a long session's hundreds of per-message records into one model_use event per
 * model (the summary already reports per-model totals), instead of bloating the event log.
 */
export function transcriptToUsage(transcriptText: string): BufferLine[] {
  const lines = transcriptText.split("\n").filter(Boolean);
  const byId = new Map<
    string,
    { model: string; input: number; output: number }
  >();
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
    if (!prev || output >= prev.output) {
      byId.set(id, { model: m.model || "unknown", input, output });
    }
  }

  // Aggregate the deduped per-message usage into one record per model.
  const byModel = new Map<string, BufferLine>();
  for (const r of byId.values()) {
    const agg = byModel.get(r.model) ?? {
      t: Date.now(),
      kind: "model" as const,
      model: r.model,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
    };
    agg.inputTokens = (agg.inputTokens ?? 0) + r.input;
    agg.outputTokens = (agg.outputTokens ?? 0) + r.output;
    agg.calls = (agg.calls ?? 0) + 1;
    byModel.set(r.model, agg);
  }
  return [...byModel.values()];
}
