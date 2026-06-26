import { describe, it, expect } from "vitest";
import type { Session, SessionSummary } from "@wrud/shared";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { computeOverview } from "./overview.js";

const session = (id: string, status: Session["status"]): Session => ({
  id,
  apiKeyId: "k1",
  user: { id: "u1" },
  agent: { name: "claude-code" },
  runtime: {},
  metadata: {},
  status,
  startedAt: "2026-06-25T10:00:00.000Z",
  endedAt: null,
  createdAt: `2026-06-25T10:0${id}:00.000Z`,
});

const summary = (id: string, model: string, out: number): SessionSummary => ({
  sessionId: id,
  stats: {
    durationMs: 1000,
    eventCount: 2,
    toolCalls: {},
    filesTouched: [],
    models: [{ model, calls: 1, inputTokens: 10, outputTokens: out }],
    errorCount: 0,
    messageCount: 0,
  },
  narrative: null,
  insights: [
    {
      type: "model_rightsizing",
      severity: "warn",
      title: "t",
      detail: "d",
      evidence: {},
    },
  ],
  summarizerVersion: "x",
  generatedAt: "2026-06-25T11:00:00.000Z",
});

describe("computeOverview", () => {
  it("aggregates sessions, models, insights, and lessons", async () => {
    const store = new MemoryStorageAdapter();
    await store.createSession(session("1", "summarized"));
    await store.createSession(session("2", "summarized"));
    await store.createSession(session("3", "open"));
    await store.saveSummary(summary("1", "claude-opus-4-8", 50));
    await store.saveSummary(summary("2", "claude-opus-4-8", 80));
    await store.saveLesson({
      id: "l1",
      sessionId: "1",
      scope: "user",
      guidance: "g",
      source: "model_rightsizing",
      createdAt: "2026-06-25T11:00:00.000Z",
    });

    const o = await computeOverview(store);
    expect(o.sessions.total).toBe(3);
    expect(o.sessions.byStatus).toEqual({ summarized: 2, open: 1 });
    expect(o.models).toHaveLength(1);
    expect(o.models[0]!.model).toBe("claude-opus-4-8");
    expect(o.models[0]!.sessions).toBe(2);
    expect(o.models[0]!.outputTokens).toBe(130);
    expect(o.insights.total).toBe(2);
    expect(o.insights.byType.model_rightsizing).toBe(2);
    expect(o.lessons.total).toBe(1);
  });
});
