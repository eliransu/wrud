import { describe, it, expect } from "vitest";
import type { SessionSummary } from "@wrud/shared";
import { ModelRightsizingAnalyzer, modelTier } from "./model-rightsizing.js";

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
  generatedAt: "2026-06-25T11:00:00.000Z",
});

describe("modelTier", () => {
  it("classifies known model families", () => {
    expect(modelTier("claude-opus-4-8")).toBe("high");
    expect(modelTier("claude-sonnet-4-6")).toBe("mid");
    expect(modelTier("claude-haiku-4-5")).toBe("low");
    expect(modelTier("gpt-9")).toBeUndefined();
  });
});

describe("ModelRightsizingAnalyzer", () => {
  const a = new ModelRightsizingAnalyzer();
  it("flags a high-tier model used for a tiny task", () => {
    const out = a.analyze(
      summary({
        models: [
          {
            model: "claude-opus-4-8",
            calls: 1,
            inputTokens: 50,
            outputTokens: 80,
          },
        ],
        eventCount: 3,
      }),
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("model_rightsizing");
    expect(out[0]!.evidence.model).toBe("claude-opus-4-8");
  });
  it("does not flag a high-tier model doing real work (large output)", () => {
    const out = a.analyze(
      summary({
        models: [
          {
            model: "claude-opus-4-8",
            calls: 5,
            inputTokens: 5000,
            outputTokens: 4000,
          },
        ],
        eventCount: 40,
      }),
      [],
    );
    expect(out).toHaveLength(0);
  });
  it("does not flag a low-tier model", () => {
    const out = a.analyze(
      summary({
        models: [
          {
            model: "claude-haiku-4-5",
            calls: 1,
            inputTokens: 10,
            outputTokens: 20,
          },
        ],
      }),
      [],
    );
    expect(out).toHaveLength(0);
  });
  it("does not flag when the session had errors", () => {
    const out = a.analyze(
      summary({
        models: [
          {
            model: "claude-opus-4-8",
            calls: 1,
            inputTokens: 50,
            outputTokens: 80,
          },
        ],
        errorCount: 2,
      }),
      [],
    );
    expect(out).toHaveLength(0);
  });
});
