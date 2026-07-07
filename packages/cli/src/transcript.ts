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
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
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
          cacheReadTokens: l.cacheReadTokens,
          cacheCreationTokens: l.cacheCreationTokens,
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
 *   1. dedup by message id, cache-aware (inputTokens = input + cache_creation + cache_read;
 *      the cache parts are ALSO kept as separate subsets so pricing can bill them at cache
 *      rates), keeping the most-complete sighting of each assistant message (streaming logs
 *      partials first);
 *   2. AGGREGATE per model into ONE record carrying summed tokens + a `calls` count.
 * This collapses a long session's hundreds of per-message records into one model_use event per
 * model (the summary already reports per-model totals), instead of bloating the event log.
 */
export function transcriptToUsage(transcriptText: string): BufferLine[] {
  const lines = transcriptText.split("\n").filter(Boolean);
  const byId = new Map<
    string,
    {
      model: string;
      input: number;
      output: number;
      cacheRead: number;
      cacheCreation: number;
    }
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
    const cacheRead = u.cache_read_input_tokens || 0;
    const cacheCreation = u.cache_creation_input_tokens || 0;
    const input = (u.input_tokens || 0) + cacheCreation + cacheRead;
    const output = u.output_tokens || 0;
    const id = m.id || `${m.model}:${input}:${output}`;
    const prev = byId.get(id);
    if (!prev || output >= prev.output) {
      byId.set(id, {
        model: m.model || "unknown",
        input,
        output,
        cacheRead,
        cacheCreation,
      });
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
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      calls: 0,
    };
    agg.inputTokens = (agg.inputTokens ?? 0) + r.input;
    agg.outputTokens = (agg.outputTokens ?? 0) + r.output;
    agg.cacheReadTokens = (agg.cacheReadTokens ?? 0) + r.cacheRead;
    agg.cacheCreationTokens = (agg.cacheCreationTokens ?? 0) + r.cacheCreation;
    agg.calls = (agg.calls ?? 0) + 1;
    byModel.set(r.model, agg);
  }
  return [...byModel.values()];
}

/** Per-model running totals already reported to the server (kept in hook state / summed
 * from the buffer), so each transcript re-read ships only the not-yet-reported remainder. */
export type UsageTotals = Record<
  string,
  {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
    calls: number;
  }
>;

/** Sum per-model usage records (BufferLines or model_use payloads - same field names). */
export function usageTotals(
  records: Array<{
    model?: unknown;
    inputTokens?: unknown;
    outputTokens?: unknown;
    cacheReadTokens?: unknown;
    cacheCreationTokens?: unknown;
    calls?: unknown;
  }>,
): UsageTotals {
  const out: UsageTotals = {};
  for (const r of records) {
    if (typeof r.model !== "string" || !r.model) continue;
    const t = (out[r.model] ??= {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
      calls: 0,
    });
    t.input += Number(r.inputTokens) || 0;
    t.output += Number(r.outputTokens) || 0;
    t.cacheRead += Number(r.cacheReadTokens) || 0;
    t.cacheCreation += Number(r.cacheCreationTokens) || 0;
    t.calls += Number(r.calls) || 1;
  }
  return out;
}

/** Cumulative transcript usage minus what was already reported -> delta model records to
 * buffer now. Empty deltas are dropped; negatives clamp to 0 (a rewritten transcript). */
export function usageDelta(
  cumulative: BufferLine[],
  reported: UsageTotals,
): BufferLine[] {
  const out: BufferLine[] = [];
  for (const c of cumulative) {
    if (!c.model) continue;
    const r = reported[c.model] ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
      calls: 0,
    };
    const d: BufferLine = {
      t: c.t ?? Date.now(),
      kind: "model",
      model: c.model,
      inputTokens: Math.max(0, (c.inputTokens ?? 0) - r.input),
      outputTokens: Math.max(0, (c.outputTokens ?? 0) - r.output),
      cacheReadTokens: Math.max(0, (c.cacheReadTokens ?? 0) - r.cacheRead),
      cacheCreationTokens: Math.max(
        0,
        (c.cacheCreationTokens ?? 0) - r.cacheCreation,
      ),
      calls: Math.max(0, (c.calls ?? 0) - r.calls),
    };
    if (d.inputTokens || d.outputTokens || d.calls) out.push(d);
  }
  return out;
}
