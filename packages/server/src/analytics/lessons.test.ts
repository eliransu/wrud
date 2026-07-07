import { describe, it, expect } from "vitest";
import type { Insight } from "@wrud/shared";
import { lessonsFromInsights } from "./lessons.js";

const insight = (over: Partial<Insight>): Insight => ({
  type: "model_rightsizing",
  severity: "warn",
  title: "t",
  detail: "d",
  evidence: {},
  ...over,
});

describe("lessonsFromInsights", () => {
  it("maps a model_rightsizing insight to a user-scoped lesson", () => {
    const out = lessonsFromInsights(
      [
        insight({
          type: "model_rightsizing",
          evidence: { model: "claude-opus-4-8" },
        }),
      ],
      "s1",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.scope).toBe("user");
    expect(out[0]!.source).toBe("model_rightsizing");
    expect(out[0]!.guidance).toContain("claude-opus-4-8");
    expect(out[0]!.sessionId).toBe("s1");
  });
  it("maps a high_error_rate insight to a session-scoped lesson", () => {
    const out = lessonsFromInsights(
      [insight({ type: "high_error_rate", evidence: { errorCount: 5 } })],
      "s1",
    );
    expect(out[0]!.scope).toBe("session");
    expect(out[0]!.guidance).toContain("5");
  });
  it("maps a context_overhead insight to a user-scoped lesson", () => {
    const out = lessonsFromInsights(
      [
        insight({
          type: "context_overhead",
          evidence: { avgInputPerCall: 39382, cachedInputPct: 90 },
        }),
      ],
      "s1",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.scope).toBe("user");
    expect(out[0]!.source).toBe("context_overhead");
    expect(out[0]!.guidance).toContain("39,382");
    expect(out[0]!.guidance).toContain("MCP");
    expect(out[0]!.guidance).toContain("90%");
  });
  it("ignores insight types it has no lesson for", () => {
    expect(
      lessonsFromInsights([insight({ type: "something_else" })], "s1"),
    ).toEqual([]);
  });
});
