/**
 * DeterministicSummarizer - pure stats fold, now delegating to the shared `deterministicStats`
 * so server and client compute identical stats. narrative null, insights [] (the composite
 * summarizer adds analyzers + narrative).
 */
import {
  deterministicStats,
  type Summarizer,
  type Session,
  type Event,
  type SessionSummary,
  type Clock,
} from "@wrud/shared";

export class DeterministicSummarizer implements Summarizer {
  version = "deterministic@1";
  constructor(private clock: Clock = () => new Date()) {}

  async summarize(session: Session, events: Event[]): Promise<SessionSummary> {
    return {
      sessionId: session.id,
      stats: deterministicStats(events),
      narrative: null,
      insights: [],
      summarizerVersion: this.version,
      generatedAt: this.clock().toISOString(),
      summarizedBy: "server",
    };
  }
}
