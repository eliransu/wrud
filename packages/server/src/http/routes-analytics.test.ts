import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { buildSummarizer } from "../summarize/composite.js";
import { defaultAnalyzers } from "../insights/index.js";
import { hashApiKey } from "../auth/keys.js";

function setup() {
  const storage = new MemoryStorageAdapter();
  void storage.createApiKey({
    id: "k1",
    name: "n",
    prefix: "p",
    hash: hashApiKey("sk"),
    scopes: ["ingest", "read"],
    createdAt: "2026-06-25T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  const app = buildApp({
    storage,
    summarizer: buildSummarizer({
      analyzers: defaultAnalyzers(),
      clock: () => new Date("2026-06-25T11:00:00.000Z"),
    }),
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date("2026-06-25T10:00:00.000Z"),
  });
  return {
    app,
    h: { authorization: "Bearer sk", "content-type": "application/json" },
  };
}

describe("analytics routes", () => {
  it("generates lessons on summarize and exposes them + an overview rollup", async () => {
    const { app, h } = setup();
    const sid = (
      (await (
        await app.request("/v1/sessions", {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            user: { id: "u1" },
            agent: { name: "claude-code" },
          }),
        })
      ).json()) as any
    ).sessionId;

    // a trivial Opus use -> ModelRightsizingAnalyzer fires -> lesson generated
    await app.request(`/v1/sessions/${sid}/events`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        events: [
          {
            id: "e0",
            sessionId: sid,
            seq: 0,
            timestamp: "2026-06-25T10:00:00.000Z",
            type: "model_use",
            payload: { model: "claude-opus-4-8", outputTokens: 30 },
          },
        ],
      }),
    });
    const summary = (await (
      await app.request(`/v1/sessions/${sid}/summarize`, {
        method: "POST",
        headers: h,
      })
    ).json()) as any;
    expect(summary.insights.map((i: any) => i.type)).toContain(
      "model_rightsizing",
    );

    const lessons = (await (
      await app.request("/v1/lessons", { headers: h })
    ).json()) as any;
    expect(lessons.items.length).toBeGreaterThanOrEqual(1);
    expect(lessons.items[0].source).toBe("model_rightsizing");

    const overview = (await (
      await app.request("/v1/stats/overview", { headers: h })
    ).json()) as any;
    expect(overview.sessions.total).toBe(1);
    expect(overview.models[0].model).toBe("claude-opus-4-8");
    expect(overview.insights.byType.model_rightsizing).toBe(1);
    expect(overview.lessons.total).toBeGreaterThanOrEqual(1);
  });

  it("requires read scope for lessons and overview", async () => {
    const { app } = setup();
    expect((await app.request("/v1/lessons")).status).toBe(401);
    expect((await app.request("/v1/stats/overview")).status).toBe(401);
  });
});
