import { describe, it, expect } from "vitest";
import type { Session, Event } from "@wrud/shared";
import { DeterministicSummarizer } from "./deterministic.js";

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
    type: "tool_call",
    payload: { name: "Edit", ok: true },
  },
  {
    id: "e3",
    sessionId: "s1",
    seq: 2,
    timestamp: "2026-06-25T10:00:10.000Z",
    type: "model_use",
    payload: { model: "claude-opus-4-8", inputTokens: 100, outputTokens: 50 },
  },
  {
    id: "e4",
    sessionId: "s1",
    seq: 3,
    timestamp: "2026-06-25T10:00:20.000Z",
    type: "file_change",
    payload: { path: "a.ts", op: "edit" },
  },
  {
    id: "e5",
    sessionId: "s1",
    seq: 4,
    timestamp: "2026-06-25T10:00:30.000Z",
    type: "error",
    payload: { message: "boom" },
  },
  {
    id: "e6",
    sessionId: "s1",
    seq: 5,
    timestamp: "2026-06-25T10:00:25.000Z",
    type: "message",
    payload: { role: "assistant", chars: 100 },
  },
];

describe("DeterministicSummarizer", () => {
  it("folds events into deterministic stats", async () => {
    const s = await new DeterministicSummarizer(
      () => new Date("2026-06-25T11:00:00.000Z"),
    ).summarize(session, events);
    expect(s.summarizerVersion).toBe("deterministic@1");
    expect(s.narrative).toBeNull();
    expect(s.insights).toEqual([]);
    expect(s.stats.eventCount).toBe(6);
    expect(s.stats.toolCalls).toEqual({ Edit: 2 });
    expect(s.stats.filesTouched).toEqual(["a.ts"]);
    expect(s.stats.errorCount).toBe(1);
    expect(s.stats.messageCount).toBe(1);
    expect(s.stats.models).toEqual([
      {
        model: "claude-opus-4-8",
        calls: 1,
        inputTokens: 100,
        outputTokens: 50,
      },
    ]);
    expect(s.stats.durationMs).toBe(30000); // first to last event timestamp
    expect(s.generatedAt).toBe("2026-06-25T11:00:00.000Z");
  });
  it("handles an empty session", async () => {
    const s = await new DeterministicSummarizer(() => new Date(0)).summarize(
      session,
      [],
    );
    expect(s.stats.eventCount).toBe(0);
    expect(s.stats.durationMs).toBe(0);
  });
});
