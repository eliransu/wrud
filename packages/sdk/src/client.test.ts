import { describe, it, expect } from "vitest";
import { buildApp } from "../../server/src/app.js";
import { MemoryStorageAdapter } from "../../server/src/storage/memory.js";
import { MemoryRateLimiter } from "../../server/src/ratelimit/memory.js";
import { DeterministicSummarizer } from "../../server/src/summarize/deterministic.js";
import { hashApiKey } from "../../server/src/auth/keys.js";
import { createWrudClient } from "./client.js";

function harness() {
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
  // a fetch that routes straight into the Hono app (no network)
  const fetchImpl = (url: string, init?: RequestInit) =>
    app.request(url, init as never);
  return {
    client: createWrudClient({
      baseUrl: "http://x",
      apiKey: "sk",
      fetch: fetchImpl as never,
    }),
    storage,
  };
}

describe("SDK client", () => {
  it("starts a session, buffers events, and summarizes (flush on summarize)", async () => {
    const { client } = harness();
    const session = await client.startSession({
      user: { id: "u1" },
      agent: { name: "claude-code" },
    });
    session.event({ type: "tool_call", name: "Edit", ok: true });
    session.event({
      type: "model_use",
      model: "claude-opus-4-8",
      outputTokens: 30,
      task: "rename",
    });
    const summary = await session.summarize();
    expect(summary.stats.eventCount).toBe(2);
    expect(summary.stats.toolCalls).toEqual({ Edit: 1 });
  });

  it("event() never throws on a malformed event (resilient by contract)", async () => {
    const { client } = harness();
    const session = await client.startSession({
      user: { id: "u1" },
      agent: { name: "claude-code" },
    });
    expect(() => session.event({ type: "tool_call" } as never)).not.toThrow();
    expect(session.droppedCount).toBe(1);
  });

  it("resumeSession continues seq across processes so events don't collide at 0", async () => {
    const { client } = harness();
    const created = await client.startSession({
      user: { id: "u1" },
      agent: { name: "claude-code" },
    });
    const sid = created.sessionId;

    // process 1: append one event starting at seq 0, persist the cursor
    const p1 = client.resumeSession(sid, 0);
    p1.event({ type: "tool_call", name: "Edit", ok: true });
    await p1.flush();
    const cursor = p1.nextSeq;
    expect(cursor).toBe(1);

    // process 2 (fresh handle): resume from the persisted cursor
    const p2 = client.resumeSession(sid, cursor);
    p2.event({ type: "tool_call", name: "Read", ok: true });
    await p2.flush();

    const summary = await client.resumeSession(sid, p2.nextSeq).summarize();
    expect(summary.stats.eventCount).toBe(2); // both events survived (no seq collision)
    expect(summary.stats.toolCalls).toEqual({ Edit: 1, Read: 1 });
  });
});
