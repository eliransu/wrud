/**
 * Static list-price table (USD per million tokens) for the ~$ cost estimates shown in the
 * dashboard. Estimates are deliberately approximate:
 *
 * - Cache discounts ARE modeled when the usage record carries cacheReadTokens /
 *   cacheCreationTokens (subsets of inputTokens, from the cli transcript parser): reads at
 *   0.1x the input rate, creation at 1.25x (Anthropic 5-min-TTL rates). Records without the
 *   split (older data, live counters) price all input at full weight - an UPPER BOUND.
 * - Context-length tiers (Gemini Pro >200k) and batch discounts are not modeled either.
 *
 * Prices verified 2026-07-02 against the providers' official pricing pages.
 * ponytail: static table - revisit when a provider reprices (known: Sonnet 5 goes
 * $2/$10 -> $3/$15 on 2026-09-01; Opus 4.1 retires 2026-08-05).
 */

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * Ordered most-specific-first; the first pattern found in the normalized model id wins.
 * Patterns shorter than 4 chars must match the id's start (guards "o3" against substrings).
 */
const PRICES: Array<[pattern: string, inPerM: number, outPerM: number]> = [
  // Anthropic (dated snapshots + Bedrock/Vertex prefixes handled by normalize())
  ["fable-5", 10, 50],
  ["mythos-5", 10, 50],
  ["opus-4-1", 15, 75],
  ["opus-4-5", 5, 25],
  ["opus-4-6", 5, 25],
  ["opus-4-7", 5, 25],
  ["opus-4-8", 5, 25],
  ["opus-4", 15, 75], // bare Opus 4 (retired) - must come after the 4-x rules above
  ["opus", 5, 25],
  ["sonnet-5", 2, 10], // intro price; 3/15 from 2026-09-01
  ["3-5-haiku", 0.8, 4],
  ["sonnet", 3, 15],
  ["haiku", 1, 5],
  // OpenAI
  ["gpt-5.5", 5, 30],
  ["gpt-5.4-mini", 0.75, 4.5],
  ["gpt-5.4-nano", 0.2, 1.25],
  ["gpt-5.4", 2.5, 15],
  ["gpt-5.3-codex", 1.75, 14],
  ["gpt-5-mini", 0.25, 2],
  ["gpt-5-nano", 0.05, 0.4],
  ["gpt-5", 1.25, 10], // also covers gpt-5-codex
  ["gpt-4.1", 2, 8],
  ["o3", 2, 8],
  // Google (<=200k-token tier for the Pro models)
  ["gemini-3.5-flash", 1.5, 9],
  ["gemini-3.1-pro", 2, 12],
  ["gemini-3.1-flash-lite", 0.25, 1.5],
  ["gemini-3-pro", 2, 12],
  ["gemini-3-flash", 0.5, 3],
  ["gemini-2.5-flash-lite", 0.1, 0.4],
  ["gemini-2.5-pro", 1.25, 10],
  ["gemini-2.5-flash", 0.3, 2.5],
  // xAI
  ["grok-code", 0.2, 1.5],
  ["grok", 1.25, 2.5],
];

/** Strip provider routing prefixes and version/date suffixes so patterns match everywhere. */
function normalize(id: string): string {
  return id
    .toLowerCase()
    .replace(/^(us\.|eu\.|apac\.)?anthropic\./, "") // Bedrock: us.anthropic.claude-...
    .replace(/-v\d+:\d+$/, "") // Bedrock: ...-v1:0
    .replace(/@\d{8}$/, "") // Vertex: ...@20250929
    .replace(/-\d{8}$/, ""); // dated snapshots: ...-20251001
}

export function priceForModel(model: string): ModelPrice | undefined {
  const id = normalize(model);
  for (const [pattern, inPerM, outPerM] of PRICES) {
    const hit =
      pattern.length < 4 ? id.startsWith(pattern) : id.includes(pattern);
    if (hit) return { inputPerMTok: inPerM, outputPerMTok: outPerM };
  }
  return undefined;
}

// ponytail: Anthropic 5-min-TTL cache rates applied to every provider; only the Anthropic
// transcript parser emits the cache split today, so nothing else is mispriced.
const CACHE_READ_MULT = 0.1;
const CACHE_CREATION_MULT = 1.25;

/**
 * Input tokens re-weighted at cache rates - the billable-input equivalent. Without a cache
 * split this is just inputTokens (full weight, upper bound).
 */
export function effectiveInputTokens(m: {
  inputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}): number {
  const read = m.cacheReadTokens ?? 0;
  const creation = m.cacheCreationTokens ?? 0;
  return (
    Math.max(0, m.inputTokens - read - creation) +
    read * CACHE_READ_MULT +
    creation * CACHE_CREATION_MULT
  );
}

/**
 * ~$ for a set of per-model token counts. Returns null when any model that actually used
 * tokens has no known price - a partial sum would read as "the whole session cost $0.02".
 * cacheReadTokens/cacheCreationTokens are SUBSETS of inputTokens; when present, those
 * portions are billed at cache rates and only the remainder at the full input rate.
 */
export function estimateCostUsd(
  models: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  }>,
): number | null {
  let total = 0;
  let priced = false;
  for (const m of models) {
    if (!m.inputTokens && !m.outputTokens) continue;
    const p = priceForModel(m.model);
    if (!p) return null;
    total +=
      (effectiveInputTokens(m) * p.inputPerMTok +
        m.outputTokens * p.outputPerMTok) /
      1e6;
    priced = true;
  }
  return priced ? total : null;
}

/** Table-friendly rendering: "-" for unknown, "~$0.004" tiny, "~$1.23", "~$1,234". */
export function formatApproxUsd(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n === 0) return "$0";
  if (n < 0.01) return "~$" + n.toFixed(3);
  if (n < 100) return "~$" + n.toFixed(2);
  return "~$" + Math.round(n).toLocaleString("en-US");
}
