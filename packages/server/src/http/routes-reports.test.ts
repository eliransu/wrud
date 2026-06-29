import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { DeterministicSummarizer } from "../summarize/deterministic.js";
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
    summarizer: new DeterministicSummarizer(
      () => new Date("2026-06-25T11:00:00.000Z"),
    ),
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date("2026-06-25T10:00:00.000Z"),
  });
  const h = { authorization: "Bearer sk", "content-type": "application/json" };
  return { app, h };
}

async function seed(
  app: ReturnType<typeof buildApp>,
  h: Record<string, string>,
) {
  const create = async (user: string) => {
    const r = await app.request("/v1/sessions", {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        user: { id: user },
        agent: { name: "claude-code" },
      }),
    });
    return ((await r.json()) as any).sessionId as string;
  };
  const s1 = await create("alice");
  await app.request(`/v1/sessions/${s1}/events`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      events: [
        {
          id: "a0",
          sessionId: s1,
          seq: 0,
          timestamp: "2026-06-25T10:00:00.000Z",
          type: "tool_call",
          payload: {
            name: "Skill",
            ok: true,
            input: { skill: "frontend-design" },
          },
        },
        {
          id: "a1",
          sessionId: s1,
          seq: 1,
          timestamp: "2026-06-25T10:00:01.000Z",
          type: "model_use",
          payload: { model: "opus", inputTokens: 10, outputTokens: 900 },
        },
      ],
    }),
  });
  const s2 = await create("bob");
  await app.request(`/v1/sessions/${s2}/events`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      events: [
        {
          id: "b0",
          sessionId: s2,
          seq: 0,
          timestamp: "2026-06-25T10:00:00.000Z",
          type: "tool_call",
          payload: { name: "mcp__slack__send", ok: true },
        },
        {
          id: "b1",
          sessionId: s2,
          seq: 1,
          timestamp: "2026-06-25T10:00:01.000Z",
          type: "model_use",
          payload: { model: "haiku", inputTokens: 5, outputTokens: 10 },
        },
      ],
    }),
  });
  return { s1, s2 };
}

describe("facets + reports routes", () => {
  let app: ReturnType<typeof buildApp>;
  let h: Record<string, string>;
  beforeEach(() => ({ app, h } = setup()));

  it("GET /v1/facets lists distinct values + counts (global, not just a page)", async () => {
    await seed(app, h);
    const facets = (await (
      await app.request("/v1/facets", { headers: h })
    ).json()) as any;
    expect(facets.user).toContainEqual({ value: "alice", sessions: 1 });
    expect(facets.user).toContainEqual({ value: "bob", sessions: 1 });
    expect(facets.skill).toEqual([{ value: "frontend-design", sessions: 1 }]);
    expect(facets.mcp).toEqual([{ value: "mcp__slack__send", sessions: 1 }]);
    // prefix search for type-ahead
    const oneDim = (await (
      await app.request("/v1/facets?dim=user&q=al", { headers: h })
    ).json()) as any;
    expect(oneDim.user).toEqual([{ value: "alice", sessions: 1 }]);
    expect(oneDim.skill).toBeUndefined();
  });

  it("GET /v1/sessions applies multi-facet + token filters", async () => {
    await seed(app, h);
    const r1 = (await (
      await app.request("/v1/sessions?skill=frontend-design", { headers: h })
    ).json()) as any;
    expect(r1.items.map((s: any) => s.user.id)).toEqual(["alice"]);
    // token floor
    const r2 = (await (
      await app.request("/v1/sessions?minOutputTokens=100", { headers: h })
    ).json()) as any;
    expect(r2.items.map((s: any) => s.user.id)).toEqual(["alice"]);
    // contradiction across dims -> empty
    const r3 = (await (
      await app.request("/v1/sessions?skill=frontend-design&model=haiku", {
        headers: h,
      })
    ).json()) as any;
    expect(r3.items).toEqual([]);
  });

  it("GET /v1/reports/summary returns total + per-dim aggregates", async () => {
    await seed(app, h);
    const all = (await (
      await app.request("/v1/reports/summary", { headers: h })
    ).json()) as any;
    expect(all.total).toBe(2);
    expect(all.byDim.model.map((m: any) => m.value).sort()).toEqual([
      "haiku",
      "opus",
    ]);
    expect(all.byDim.status).toEqual([{ value: "open", sessions: 2 }]);

    const filtered = (await (
      await app.request("/v1/reports/summary?user=alice", { headers: h })
    ).json()) as any;
    expect(filtered.total).toBe(1);
    expect(filtered.byDim.skill).toEqual([
      { value: "frontend-design", sessions: 1 },
    ]);
  });
});
