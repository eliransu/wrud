import { describe, expect, it } from "vitest";
import {
  buildBaseSummary,
  parseNarratorOutput,
  ModelRightsizingAnalyzer,
} from "./summarize.js";
import { sessionFacets, summaryFacets } from "./facets.js";
import type { Session, Event } from "./index.js";

const session = (cwd?: string): Session => ({
  id: "s1",
  apiKeyId: "k1",
  user: { id: "u1" },
  agent: { name: "claude-code" },
  runtime: cwd ? { cwd } : {},
  metadata: {},
  status: "open",
  startedAt: "2026-07-02T10:00:00.000Z",
  endedAt: null,
  createdAt: "2026-07-02T10:00:00.000Z",
});

let seq = 0;
const ev = (type: Event["type"], payload: any): Event =>
  ({
    id: `e${++seq}`,
    sessionId: "s1",
    seq,
    timestamp: "2026-07-02T10:00:01.000Z",
    type,
    payload,
  }) as Event;

describe("parseNarratorOutput", () => {
  it("extracts all three tagged fields", () => {
    const out = parseNarratorOutput(
      "<summary>Fixed the login bug.</summary>\n<topic>login redirect fix</topic>\n<category>debugging</category>",
    );
    expect(out).toEqual({
      narrative: "Fixed the login bug.",
      topic: "login redirect fix",
      category: "debugging",
    });
  });

  it("survives a missing tag - other fields still parse", () => {
    const out = parseNarratorOutput(
      "<summary>Wrote the launch email.</summary>\n<category>content</category>",
    );
    expect(out.narrative).toBe("Wrote the launch email.");
    expect(out.topic).toBeNull();
    expect(out.category).toBe("content");
  });

  it("collapses unknown categories to 'other', never invents", () => {
    const out = parseNarratorOutput(
      "<summary>x</summary><topic>y</topic><category>quantum-vibes</category>",
    );
    expect(out.category).toBe("other");
  });

  it("treats an untagged response as a plain narrative (older prompt compat)", () => {
    const out = parseNarratorOutput("The agent refactored the auth module.");
    expect(out).toEqual({
      narrative: "The agent refactored the auth module.",
      topic: null,
      category: null,
    });
  });

  it("returns nulls for empty output", () => {
    expect(parseNarratorOutput("")).toEqual({
      narrative: null,
      topic: null,
      category: null,
    });
  });
});

describe("buildBaseSummary context", () => {
  it("captures the user's first prompt as deterministic context", () => {
    const s = buildBaseSummary(
      session(),
      [
        ev("message", { role: "assistant", chars: 5, text: "hello" }),
        ev("message", { role: "user", chars: 20, text: "fix the login bug" }),
        ev("message", { role: "user", chars: 9, text: "try again" }),
      ],
      new Date("2026-07-02T10:05:00.000Z"),
      [],
    );
    expect(s.context).toBe("fix the login bug");
    expect(s.topic).toBeNull();
    expect(s.category).toBeNull();
  });

  it("leaves context null when no user message text was captured", () => {
    const s = buildBaseSummary(
      session(),
      [ev("tool_call", { name: "Bash", ok: true })],
      new Date(),
      [],
    );
    expect(s.context).toBeNull();
  });
});

describe("facets: project + summary", () => {
  it("derives the project facet from runtime.cwd basename", () => {
    const f = sessionFacets(session("/Users/me/dev/wrud"));
    expect(f).toContainEqual({ dim: "project", value: "wrud" });
  });

  it("skips project when cwd is absent", () => {
    expect(sessionFacets(session()).some((f) => f.dim === "project")).toBe(
      false,
    );
  });

  it("summaryFacets emits topic/category only when present", () => {
    expect(summaryFacets({ topic: null, category: null })).toEqual([]);
    expect(
      summaryFacets({ topic: "login fix", category: "debugging" }),
    ).toEqual([
      { dim: "topic", value: "login fix" },
      { dim: "category", value: "debugging" },
    ]);
  });
});

describe("ModelRightsizingAnalyzer v2", () => {
  const summaryWith = (
    models: { model: string; inputTokens: number; outputTokens: number }[],
    errorCount = 0,
  ) =>
    ({
      sessionId: "s1",
      stats: {
        durationMs: 1000,
        eventCount: 120,
        toolCalls: {},
        filesTouched: [],
        models: models.map((m) => ({ ...m, calls: 1 })),
        errorCount,
        messageCount: 4,
      },
      narrative: null,
      insights: [],
      summarizerVersion: "t",
      generatedAt: "2026-07-02T10:05:00.000Z",
    }) as any;

  it("fires on real sessions (errors present, many events) with $ amounts", () => {
    const insights = new ModelRightsizingAnalyzer().analyze(
      summaryWith(
        [{ model: "claude-opus-4-8", inputTokens: 10_000, outputTokens: 120 }],
        2, // the old analyzer suppressed on ANY error - the flag never fired in practice
      ),
      [],
    );
    expect(insights).toHaveLength(1);
    expect(insights[0]!.detail).toContain("~$");
    expect(insights[0]!.evidence.estCostUsd).toBeGreaterThan(0);
  });

  it("skips zero-output rows (model-name-only capture) - no noise flags", () => {
    const insights = new ModelRightsizingAnalyzer().analyze(
      summaryWith([
        { model: "claude-opus-4-8", inputTokens: 0, outputTokens: 0 },
      ]),
      [],
    );
    expect(insights).toHaveLength(0);
  });

  it("skips low-tier models and large outputs", () => {
    const insights = new ModelRightsizingAnalyzer().analyze(
      summaryWith([
        { model: "claude-haiku-4-5", inputTokens: 100, outputTokens: 50 },
        { model: "claude-opus-4-8", inputTokens: 100, outputTokens: 9_000 },
      ]),
      [],
    );
    expect(insights).toHaveLength(0);
  });
});
