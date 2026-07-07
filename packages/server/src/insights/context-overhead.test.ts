import { describe, it, expect } from "vitest";
import type { SessionSummary } from "@wrud/shared";
import { ContextOverheadAnalyzer } from "./context-overhead.js";

const summary = (over: Partial<SessionSummary["stats"]>): SessionSummary => ({
  sessionId: "s1",
  stats: {
    durationMs: 1000,
    eventCount: 3,
    toolCalls: {},
    filesTouched: [],
    models: [],
    errorCount: 0,
    messageCount: 0,
    ...over,
  },
  narrative: null,
  insights: [],
  summarizerVersion: "x",
  generatedAt: "2026-07-07T11:00:00.000Z",
});

describe("ContextOverheadAnalyzer", () => {
  const a = new ContextOverheadAnalyzer();
  it("flags the '39k in / 201 out' pattern (standing environment dominates)", () => {
    const out = a.analyze(
      summary({
        models: [
          {
            model: "claude-fable-5",
            calls: 1,
            inputTokens: 39382,
            outputTokens: 201,
          },
        ],
      }),
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("context_overhead");
    expect(out[0]!.severity).toBe("info");
    expect(out[0]!.evidence.avgInputPerCall).toBe(39382);
    expect(out[0]!.evidence.inOutRatio).toBe(196);
  });
  it("does not flag a real work session (big output justifies big input)", () => {
    const out = a.analyze(
      summary({
        models: [
          {
            model: "claude-fable-5",
            calls: 10,
            inputTokens: 150_000,
            outputTokens: 20_000,
          },
        ],
      }),
      [],
    );
    expect(out).toHaveLength(0);
  });
  it("does not flag zero-output rows (model-name-only capture is not evidence)", () => {
    const out = a.analyze(
      summary({
        models: [
          {
            model: "claude-fable-5",
            calls: 1,
            inputTokens: 0,
            outputTokens: 0,
          },
        ],
      }),
      [],
    );
    expect(out).toHaveLength(0);
  });
  it("notes the cached share when the cache split is present", () => {
    const out = a.analyze(
      summary({
        models: [
          {
            model: "claude-fable-5",
            calls: 2,
            inputTokens: 80_000,
            outputTokens: 500,
            cacheReadTokens: 72_000,
            cacheCreationTokens: 4_000,
          },
        ],
      }),
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.evidence.cachedInputPct).toBe(90);
    expect(out[0]!.detail).toContain("90%");
    expect(out[0]!.detail).toContain("prompt cache");
  });
});
