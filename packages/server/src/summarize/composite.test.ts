import { describe, it, expect } from "vitest";
import type { Session, Event, InsightAnalyzer } from "@wrud/shared";
import { buildSummarizer } from "./composite.js";
import { ModelRightsizingAnalyzer } from "../insights/model-rightsizing.js";

const session: Session = {
  id: "s1",
  apiKeyId: "k1",
  user: { id: "u1" },
  agent: { name: "claude-code" },
  runtime: {},
  metadata: {},
  status: "open",
  startedAt: "2026-06-25T10:00:00.000Z",
  endedAt: null,
  createdAt: "2026-06-25T10:00:00.000Z",
};
const events: Event[] = [
  {
    id: "e1",
    sessionId: "s1",
    seq: 0,
    timestamp: "2026-06-25T10:00:00.000Z",
    type: "tool_call",
    payload: { name: "Edit", ok: true },
  },
  {
    id: "e2",
    sessionId: "s1",
    seq: 1,
    timestamp: "2026-06-25T10:00:05.000Z",
    type: "model_use",
    payload: { model: "claude-opus-4-8", inputTokens: 50, outputTokens: 80 },
  },
];

const clock = () => new Date("2026-06-25T11:00:00.000Z");

describe("buildSummarizer", () => {
  it("produces deterministic stats; narrative is null without a narrator", async () => {
    const s = await buildSummarizer({ clock }).summarize(session, events);
    expect(s.stats.eventCount).toBe(2);
    expect(s.insights).toEqual([]);
    // No deterministic fallback sentence - narrative comes only from the LLM narrator.
    expect(s.narrative).toBeNull();
  });

  it("attaches insights from analyzers", async () => {
    const s = await buildSummarizer({
      clock,
      analyzers: [new ModelRightsizingAnalyzer()],
    }).summarize(session, events);
    expect(s.insights.map((i) => i.type)).toContain("model_rightsizing");
  });

  it("adds a narrative from the narrator", async () => {
    const narrator = async () => "Renamed a variable using Opus.";
    const s = await buildSummarizer({ clock, narrator }).summarize(
      session,
      events,
    );
    expect(s.narrative).toBe("Renamed a variable using Opus.");
  });

  it("leaves narrative null when the narrator throws (stats still produced)", async () => {
    const narrator = async () => {
      throw new Error("network down");
    };
    const s = await buildSummarizer({ clock, narrator }).summarize(
      session,
      events,
    );
    expect(s.narrative).toBeNull(); // no deterministic fallback
    expect(s.stats.eventCount).toBe(2); // stats still produced
  });
});
