import { describe, it, expect, beforeEach } from "vitest";
import type { Session, Event } from "@wrud/shared";
import { MemoryStorageAdapter } from "./memory.js";

const session = (id: string): Session => ({
  id,
  apiKeyId: "k1",
  user: { id: "u1" },
  agent: { name: "claude-code" },
  runtime: {},
  metadata: {},
  status: "open",
  startedAt: "2026-06-25T10:00:00.000Z",
  endedAt: null,
  createdAt: "2026-06-25T10:00:00.000Z",
});
const ev = (seq: number): Event => ({
  id: `e${seq}`,
  sessionId: "s1",
  seq,
  timestamp: "2026-06-25T10:00:00.000Z",
  type: "tool_call",
  payload: { name: "Edit", ok: true },
});

describe("MemoryStorageAdapter", () => {
  let store: MemoryStorageAdapter;
  beforeEach(() => {
    store = new MemoryStorageAdapter();
  });

  it("creates and reads a session", async () => {
    await store.createSession(session("s1"));
    expect((await store.getSession("s1"))?.id).toBe("s1");
    expect(await store.getSession("missing")).toBeUndefined();
  });

  it("appends events idempotently on (sessionId, seq) and reads them ordered", async () => {
    await store.appendEvents("s1", [ev(1), ev(0)]);
    await store.appendEvents("s1", [ev(1)]); // duplicate seq -> no-op
    const page = await store.getEvents("s1");
    expect(page.items.map((e) => e.seq)).toEqual([0, 1]);
  });

  it("sets session status + endedAt", async () => {
    await store.createSession(session("s1"));
    await store.setSessionStatus(
      "s1",
      "summarized",
      "2026-06-25T11:00:00.000Z",
    );
    const s = await store.getSession("s1");
    expect(s?.status).toBe("summarized");
    expect(s?.endedAt).toBe("2026-06-25T11:00:00.000Z");
  });

  it("lists sessions filtered by user, newest first", async () => {
    await store.createSession({
      ...session("s1"),
      createdAt: "2026-06-25T10:00:00.000Z",
    });
    await store.createSession({
      ...session("s2"),
      createdAt: "2026-06-25T10:05:00.000Z",
    });
    await store.createSession({ ...session("s3"), user: { id: "other" } });
    const page = await store.listSessions({ user: "u1" });
    expect(page.items.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("offset-paginates sessions and events with a filter-wide total", async () => {
    for (let i = 0; i < 5; i++)
      await store.createSession({
        ...session(`s${i}`),
        createdAt: `2026-06-25T10:0${i}:00.000Z`,
      });
    const p = await store.listSessions({ limit: 2, offset: 2 });
    expect(p.items.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(p.total).toBe(5);

    await store.appendEvents("s0", [0, 1, 2, 3, 4].map(ev));
    const desc = await store.getEvents("s0", {
      limit: 2,
      offset: 2,
      order: "desc",
    });
    expect(desc.items.map((e) => e.seq)).toEqual([2, 1]);
    expect(desc.total).toBe(5);
  });

  it("stores and reads a summary", async () => {
    const summary = {
      sessionId: "s1",
      stats: {
        durationMs: 0,
        eventCount: 0,
        toolCalls: {},
        filesTouched: [],
        models: [],
        errorCount: 0,
        messageCount: 0,
      },
      narrative: null,
      insights: [],
      summarizerVersion: "deterministic@1",
      generatedAt: "2026-06-25T11:00:00.000Z",
    };
    await store.saveSummary(summary);
    expect(await store.getSummary("s1")).toEqual(summary);
  });

  it("api keys: create, lookup by hash, list, revoke", async () => {
    await store.createApiKey({
      id: "k1",
      name: "test",
      prefix: "wrud_sk_local_AB...",
      hash: "HASH",
      scopes: ["admin"],
      createdAt: "2026-06-25T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    });
    expect((await store.getApiKeyByHash("HASH"))?.id).toBe("k1");
    await store.revokeApiKey("k1");
    expect((await store.getApiKeyByHash("HASH"))?.revokedAt).not.toBeNull();
    expect((await store.listApiKeys()).length).toBe(1);
  });
});
