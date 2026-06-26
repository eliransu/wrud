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

describe("session routes", () => {
  let app: ReturnType<typeof buildApp>;
  let h: Record<string, string>;
  beforeEach(() => ({ app, h } = setup()));

  it("creates a session, appends events, summarizes, and reads back", async () => {
    const created = await app.request("/v1/sessions", {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        user: { id: "u1" },
        agent: { name: "claude-code" },
      }),
    });
    expect(created.status).toBe(201);
    const { sessionId } = (await created.json()) as any;

    const ev = (seq: number, name: string) => ({
      id: `e${seq}`,
      sessionId,
      seq,
      timestamp: `2026-06-25T10:00:0${seq}.000Z`,
      type: "tool_call",
      payload: { name, ok: true },
    });
    const appended = await app.request(`/v1/sessions/${sessionId}/events`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ events: [ev(0, "Edit"), ev(1, "Read")] }),
    });
    expect(appended.status).toBe(202);
    expect(((await appended.json()) as any).accepted).toBe(2);

    const summarized = await app.request(
      `/v1/sessions/${sessionId}/summarize`,
      { method: "POST", headers: h },
    );
    expect(summarized.status).toBe(200);
    const summary = (await summarized.json()) as any;
    expect(summary.stats.eventCount).toBe(2);
    expect(summary.stats.toolCalls).toEqual({ Edit: 1, Read: 1 });

    const read = await app.request(`/v1/sessions/${sessionId}`, { headers: h });
    const reqBody = (await read.json()) as any;
    expect(reqBody.session.status).toBe("summarized");
    expect(reqBody.summary.sessionId).toBe(sessionId);
    expect(reqBody.session.apiKeyId).toBeUndefined(); // internal id not exposed
  });

  it("rejects a bad create body with 400", async () => {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ user: {} }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("bad_request");
  });

  it("404s an unknown session on read", async () => {
    expect(
      (await app.request("/v1/sessions/nope", { headers: h })).status,
    ).toBe(404);
  });

  it("404s appending events to an unknown session", async () => {
    const res = await app.request("/v1/sessions/nope/events", {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        events: [
          {
            id: "e",
            sessionId: "nope",
            seq: 0,
            timestamp: "2026-06-25T10:00:00.000Z",
            type: "error",
            payload: { message: "x" },
          },
        ],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("client mode: summarize parks the session in 'summarizing', PUT /summary finalizes it", async () => {
    const created = await app.request("/v1/sessions", {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        user: { id: "u1" },
        agent: { name: "claude-code" },
      }),
    });
    const { sessionId } = (await created.json()) as any;

    const begin = await app.request(`/v1/sessions/${sessionId}/summarize`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ mode: "client" }),
    });
    expect(begin.status).toBe(202);
    expect(((await begin.json()) as any).status).toBe("summarizing");
    const mid = (await (
      await app.request(`/v1/sessions/${sessionId}`, { headers: h })
    ).json()) as any;
    expect(mid.session.status).toBe("summarizing");

    const clientSummary = {
      sessionId,
      stats: {
        durationMs: 0,
        eventCount: 0,
        toolCalls: {},
        filesTouched: [],
        models: [],
        errorCount: 0,
        messageCount: 0,
      },
      narrative: "Set up the wrud Claude Code hook end to end.",
      insights: [],
      summarizerVersion: "client-ai@1",
      generatedAt: "2026-06-25T11:00:00.000Z",
    };
    const put = await app.request(`/v1/sessions/${sessionId}/summary`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify({ summary: clientSummary }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as any).summarizedBy).toBe("client");

    const done = (await (
      await app.request(`/v1/sessions/${sessionId}`, { headers: h })
    ).json()) as any;
    expect(done.session.status).toBe("summarized");
    expect(done.summary.narrative).toBe(
      "Set up the wrud Claude Code hook end to end.",
    );
  });
});
