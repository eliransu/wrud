// Shared helpers for the wrud Claude Code hooks.
// Architecture: HOOK-FIRST capture. Prompts (UserPromptSubmit), tool I/O (PostToolUse), and
// the assistant's text (Stop.last_assistant_message) all come from documented hook payloads.
// The ONLY thing hooks don't carry - model + token usage - is pulled ONCE at SessionEnd from
// the transcript via transcriptToUsage().

/** Map buffered records -> events. seq = index (matches across flush + finalize for dedup). */
export function bufferToEvents(lines) {
  const out = [];
  for (const l of lines) {
    if (l.kind === "tool") {
      out.push({ t: l.t, type: "tool_call", payload: { name: l.tool, ok: l.ok !== false, input: l.input, output: l.output } });
    } else if (l.kind === "msg") {
      out.push({
        t: l.t,
        type: "message",
        payload: { role: l.role || "user", chars: l.chars ?? (l.text ? String(l.text).length : 0), text: l.text },
      });
    } else if (l.kind === "model") {
      out.push({ t: l.t, type: "model_use", payload: { model: l.model, inputTokens: l.inputTokens, outputTokens: l.outputTokens } });
    }
  }
  return out;
}

/**
 * Extract model + token usage from a Claude Code transcript - the ONE thing hooks don't expose.
 * Read once at SessionEnd. Correct accounting:
 *  - **Deduped by message id** (Claude Code re-logs the same assistant message as tool results
 *    stream; naive summing inflated usage 2-4x). Keep the most-complete occurrence per id.
 *  - **Cache-aware**: total input = input_tokens + cache_creation + cache_read (true token
 *    volume; cost-tier weighting of cache is a later refinement once $ pricing lands).
 * Returns one `model` record per unique assistant message.
 */
export function transcriptToUsage(transcriptText) {
  const lines = transcriptText.split("\n").filter(Boolean);
  const byId = new Map();
  for (const raw of lines) {
    let e;
    try {
      e = JSON.parse(raw);
    } catch {
      continue;
    }
    const m = e.message;
    if (!m || m.role !== "assistant" || !m.usage) continue;
    const u = m.usage;
    const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const output = u.output_tokens || 0;
    const id = m.id || `${m.model}:${input}:${output}`;
    const prev = byId.get(id);
    // keep the most-complete sighting of a given message (streaming may log partial first)
    if (!prev || output >= prev.outputTokens) {
      byId.set(id, { t: Date.now(), kind: "model", model: m.model || "unknown", inputTokens: input, outputTokens: output });
    }
  }
  return [...byId.values()];
}
