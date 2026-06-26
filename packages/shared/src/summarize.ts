/**
 * Shared summarization primitives - the SINGLE source of truth so the server (receiver) and
 * the SDK (caller) produce byte-identical summaries. Both import `deterministicStats`, the
 * analyzers, and crucially the SAME `SUMMARY_SYSTEM_PROMPT` + `buildSummaryUserPrompt`, so an
 * LLM narrative is consistent regardless of who runs it.
 */
import type {
  Session,
  Event,
  SessionSummary,
  SummaryStats,
  Insight,
  InsightAnalyzer,
} from "./index.js";

/* ---------- deterministic stats (pure fold over events) ---------- */
export function deterministicStats(events: Event[]): SummaryStats {
  const toolCalls: Record<string, number> = {};
  const filesTouched = new Set<string>();
  const models = new Map<
    string,
    { model: string; calls: number; inputTokens: number; outputTokens: number }
  >();
  let errorCount = 0;
  let messageCount = 0;

  for (const e of events) {
    switch (e.type) {
      case "tool_call":
        toolCalls[e.payload.name] = (toolCalls[e.payload.name] ?? 0) + 1;
        break;
      case "file_change":
        filesTouched.add(e.payload.path);
        break;
      case "error":
        errorCount++;
        break;
      case "message":
        messageCount++;
        break;
      case "model_use": {
        const m = models.get(e.payload.model) ?? {
          model: e.payload.model,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
        // A model_use event may aggregate many underlying calls (payload.calls); default 1.
        m.calls += e.payload.calls ?? 1;
        m.inputTokens += e.payload.inputTokens ?? 0;
        m.outputTokens += e.payload.outputTokens ?? 0;
        models.set(e.payload.model, m);
        break;
      }
    }
  }

  const times = events
    .map((e) => Date.parse(e.timestamp))
    .sort((a, b) => a - b);
  const durationMs =
    times.length >= 2 ? times[times.length - 1]! - times[0]! : 0;

  return {
    durationMs,
    eventCount: events.length,
    toolCalls,
    filesTouched: [...filesTouched],
    models: [...models.values()],
    errorCount,
    messageCount,
  };
}

/* ---------- insight analyzers ---------- */
type Tier = "high" | "mid" | "low";

/**
 * Provider-agnostic model tier heuristic - Claude, OpenAI/Codex, Google/Vertex (Gemini),
 * and a few others. Cheap markers are checked first so e.g. "gpt-4o-mini" / "gemini-flash"
 * aren't swept up by the broader mid-tier rules. Unknown models return undefined (no
 * right-sizing flag), so adding a new provider never produces false signals. Extend freely.
 */
export function modelTier(model: string): Tier | undefined {
  const m = (model || "").toLowerCase();
  if (/haiku|mini|nano|flash|lite|small|gpt-3\.5|gemma|llama|phi-/.test(m))
    return "low";
  if (/opus|gpt-5|gpt-4\.1|gpt-4\.5|o1|o3|o4|ultra|grok-4|deepseek-r1/.test(m))
    return "high";
  if (
    /sonnet|gpt-4o|gpt-4|codex|gemini.*(pro|2\.5|1\.5)|mistral.*large|command-r|qwen.*max/.test(
      m,
    )
  )
    return "mid";
  return undefined;
}

export interface RightsizingThresholds {
  maxOutputTokens: number;
  maxEvents: number;
}
export class ModelRightsizingAnalyzer implements InsightAnalyzer {
  constructor(
    private t: RightsizingThresholds = { maxOutputTokens: 200, maxEvents: 5 },
  ) {}
  analyze(summary: SessionSummary, _events: Event[]): Insight[] {
    if (summary.stats.errorCount > 0) return [];
    const out: Insight[] = [];
    for (const m of summary.stats.models) {
      if (
        modelTier(m.model) === "high" &&
        m.outputTokens <= this.t.maxOutputTokens &&
        summary.stats.eventCount <= this.t.maxEvents
      ) {
        out.push({
          type: "model_rightsizing",
          severity: "warn",
          title: "High-tier model used for a small task",
          detail: `${m.model} produced only ${m.outputTokens} output tokens over ${summary.stats.eventCount} events - a lighter, cheaper model may have sufficed.`,
          evidence: {
            model: m.model,
            outputTokens: m.outputTokens,
            eventCount: summary.stats.eventCount,
          },
        });
      }
    }
    return out;
  }
}
export class ErrorRateAnalyzer implements InsightAnalyzer {
  constructor(private threshold = 3) {}
  analyze(summary: SessionSummary, _events: Event[]): Insight[] {
    if (summary.stats.errorCount < this.threshold) return [];
    return [
      {
        type: "high_error_rate",
        severity: "warn",
        title: "Many errors in this session",
        detail: `${summary.stats.errorCount} errors were recorded - worth reviewing what went wrong.`,
        evidence: {
          errorCount: summary.stats.errorCount,
          eventCount: summary.stats.eventCount,
        },
      },
    ];
  }
}
export const defaultAnalyzers = (): InsightAnalyzer[] => [
  new ModelRightsizingAnalyzer(),
  new ErrorRateAnalyzer(),
];

/**
 * A deterministic "context in a sentence" built from stats - so a session is never blank,
 * even without an LLM. An LLM narrator (server or client) overrides this with a nicer prose
 * version when a key is available.
 */
export function deterministicNarrative(
  stats: SummaryStats,
  agent = "agent",
): string {
  const dur =
    stats.durationMs >= 60000
      ? `${Math.round(stats.durationMs / 60000)}m`
      : `${Math.max(0, Math.round(stats.durationMs / 1000))}s`;
  const topTools = Object.entries(stats.toolCalls)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n, c]) => `${n}x${c}`)
    .join(", ");
  const models = stats.models
    .map((m) => `${m.model} (${m.outputTokens} out tok)`)
    .join(", ");
  const parts = [
    `A ${agent} session over ${dur} with ${stats.eventCount} event${stats.eventCount === 1 ? "" : "s"}`,
  ];
  if (topTools) parts.push(`top tools ${topTools}`);
  if (models) parts.push(`models ${models}`);
  if (stats.filesTouched.length)
    parts.push(
      `${stats.filesTouched.length} file${stats.filesTouched.length === 1 ? "" : "s"} touched`,
    );
  if (stats.errorCount)
    parts.push(`${stats.errorCount} error${stats.errorCount === 1 ? "" : "s"}`);
  return parts.join("; ") + ".";
}

/* ---------- base summary (stats + insights + deterministic narrative) ---------- */
export function buildBaseSummary(
  session: Session,
  events: Event[],
  now: Date,
  analyzers: InsightAnalyzer[] = defaultAnalyzers(),
): SessionSummary {
  const stats = deterministicStats(events);
  const base: SessionSummary = {
    sessionId: session.id,
    stats,
    narrative: deterministicNarrative(stats, session.agent?.name ?? "agent"),
    insights: [],
    summarizerVersion: "deterministic@1",
    generatedAt: now.toISOString(),
  };
  return {
    ...base,
    insights: analyzers.flatMap((a) => a.analyze(base, events)),
  };
}

/* ---------- the shared narration prompt (identical on server + client) ---------- */
export const SUMMARY_SYSTEM_PROMPT =
  "You are wrud, a session recorder for AI coding agents. You are given the actual conversation " +
  "of one session - the user's prompts, the agent's replies, and the tools it ran - plus summary " +
  "stats for context. Write a neutral, concrete 2-4 sentence summary of WHAT THE USER WANTED and " +
  "WHAT THE AGENT ACTUALLY DID AND ACCOMPLISHED. Summarize the substance of the work, not the " +
  "metrics (do not just restate event/token counts). No preamble, no markdown, no bullet points - " +
  "just the sentences.";

const clipLine = (s: string, n: number): string =>
  s.length > n ? s.slice(0, n) + "..." : s;

/**
 * A chronological digest of the actual conversation built from captured events - user/assistant
 * messages (the dialogue) plus the tools that ran. This is what lets the narrator summarize the
 * real work instead of the stats. Kept within a char budget: when a session is long we keep the
 * head (intent) and tail (outcome) and elide the middle.
 */
function conversationDigest(events: Event[], budget = 8000): string {
  const lines: string[] = [];
  for (const e of events) {
    if (
      e.type === "message" &&
      typeof e.payload.text === "string" &&
      e.payload.text.trim()
    ) {
      const role =
        e.payload.role === "assistant"
          ? "ASSISTANT"
          : e.payload.role === "system"
            ? "SYSTEM"
            : "USER";
      lines.push(`${role}: ${clipLine(e.payload.text.trim(), 600)}`);
    } else if (e.type === "tool_call") {
      const name = String(e.payload.name ?? "tool");
      const input =
        typeof e.payload.input === "string"
          ? e.payload.input
          : JSON.stringify(e.payload.input ?? "");
      lines.push(
        input && input !== "{}" && input !== '""'
          ? `[ran ${name}] ${clipLine(input, 160)}`
          : `[ran ${name}]`,
      );
    } else if (e.type === "error") {
      lines.push(`[error] ${clipLine(String(e.payload.message ?? ""), 160)}`);
    }
  }
  if (lines.length === 0) return "";
  let text = lines.join("\n");
  if (text.length > budget) {
    const head = lines.slice(0, Math.max(1, Math.ceil(lines.length * 0.6)));
    const tail = lines.slice(-Math.max(1, Math.floor(lines.length * 0.25)));
    text = `${head.join("\n")}\n[... ${Math.max(0, lines.length - head.length - tail.length)} more steps ...]\n${tail.join("\n")}`;
    if (text.length > budget) text = text.slice(0, budget) + "...";
  }
  return text;
}

export function buildSummaryUserPrompt(
  stats: SummaryStats,
  insights: Insight[],
  events: Event[] = [],
): string {
  const tools = Object.entries(stats.toolCalls)
    .map(([n, c]) => `${n}x${c}`)
    .join(", ");
  const models = stats.models
    .map((m) => `${m.model} (${m.outputTokens} out tok)`)
    .join(", ");
  const files = stats.filesTouched
    .map((p) => p.split("/").pop() ?? p)
    .join(", ");
  const signals = insights.map((i) => i.type).join(", ");
  const statsBlock = [
    `Stats (context only): duration ${Math.round(stats.durationMs / 1000)}s, ${stats.eventCount} events, ${stats.errorCount} errors, ${stats.messageCount} messages.`,
    `Tools: ${tools || "none"}. Models: ${models || "none"}. Files touched: ${files || "none"}. Signals: ${signals || "none"}.`,
  ].join("\n");
  const convo = conversationDigest(events);
  return convo
    ? `Conversation (chronological - the actual prompts, replies, and actions):\n${convo}\n\n${statsBlock}`
    : statsBlock;
}
