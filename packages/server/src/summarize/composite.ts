/**
 * buildSummarizer - composes the shared base summary (stats + analyzer insights) with an
 * optional LLM narrator into one server-side Summarizer. Deterministic stats always succeed;
 * the narrator (if present) adds the "context in a sentence" and is best-effort.
 */
import {
  buildBaseSummary,
  type Summarizer,
  type InsightAnalyzer,
  type Clock,
  type Session,
  type SessionSummary,
  type Event,
} from "@wrud/shared";

export type Narrator = (ctx: {
  session: Session;
  summary: SessionSummary;
  events: Event[];
}) => Promise<string>;

export interface SummarizerOptions {
  analyzers?: InsightAnalyzer[];
  narrator?: Narrator;
  clock?: Clock;
}

export function buildSummarizer(opts: SummarizerOptions = {}): Summarizer {
  const clock = opts.clock ?? (() => new Date());
  const version = `composite@1(deterministic@1${opts.narrator ? "+llm" : ""}${opts.analyzers?.length ? "+insights" : ""})`;

  return {
    version,
    async summarize(session, events) {
      const base = buildBaseSummary(
        session,
        events,
        clock(),
        opts.analyzers ?? [],
      );
      // Narrative comes ONLY from the LLM narrator; stays null (blank) when there's no narrator
      // or it fails - no deterministic stats-sentence fallback.
      let narrative: string | null = base.narrative; // null from buildBaseSummary
      if (opts.narrator) {
        try {
          const n = await opts.narrator({ session, summary: base, events });
          if (n && n.trim()) narrative = n.trim();
        } catch {
          /* leave narrative null on narrator failure */
        }
      }
      return {
        ...base,
        narrative,
        summarizerVersion: version,
        summarizedBy: "server",
      };
    },
  };
}
