import { describe, it, expect, beforeEach } from "vitest";
import type { Session, Event } from "@wrud/shared";
import { SqliteStorageAdapter } from "./sqlite.js";

const session = (id: string): Session => ({
  id,
  apiKeyId: "k1",
  user: { id: "u1", email: "u@x.io" },
  agent: { name: "claude-code", version: "1" },
  runtime: { os: "darwin" },
  metadata: { foo: 1 },
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
  type: "model_use",
  payload: { model: "claude-opus-4-8", outputTokens: 10 },
});

describe("SqliteStorageAdapter", () => {
  let store: SqliteStorageAdapter;
  beforeEach(() => {
    store = new SqliteStorageAdapter(":memory:");
  });

  it("round-trips a session with nested JSON intact", async () => {
    await store.createSession(session("s1"));
    const s = await store.getSession("s1");
    expect(s?.user.email).toBe("u@x.io");
    expect(s?.metadata).toEqual({ foo: 1 });
  });

  it("appends events idempotently and reads ordered by seq", async () => {
    await store.appendEvents("s1", [ev(2), ev(0)]);
    await store.appendEvents("s1", [ev(0)]); // dup -> ignored
    const page = await store.getEvents("s1");
    expect(page.items.map((e) => e.seq)).toEqual([0, 2]);
    expect(page.items[0]!.type).toBe("model_use");
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
    const page = await store.listSessions({ user: "u1" });
    expect(page.items.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("saves and lists lessons filtered by scope", async () => {
    await store.saveLesson({
      id: "l1",
      sessionId: "s1",
      scope: "user",
      guidance: "g1",
      source: "model_rightsizing",
      createdAt: "2026-06-25T11:00:00.000Z",
    });
    await store.saveLesson({
      id: "l2",
      sessionId: "s1",
      scope: "session",
      guidance: "g2",
      source: "high_error_rate",
      createdAt: "2026-06-25T11:01:00.000Z",
    });
    const all = await store.listLessons({});
    expect(all.items).toHaveLength(2);
    const userOnly = await store.listLessons({ scope: "user" });
    expect(userOnly.items.map((l) => l.id)).toEqual(["l1"]);
    const bySession = await store.listLessons({ sessionId: "s1" });
    expect(bySession.items).toHaveLength(2);
  });

  it("api key lookup by hash + revoke", async () => {
    await store.createApiKey({
      id: "k1",
      name: "n",
      prefix: "p",
      hash: "H",
      scopes: ["read"],
      createdAt: "2026-06-25T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    });
    expect((await store.getApiKeyByHash("H"))?.id).toBe("k1");
    await store.revokeApiKey("k1");
    expect((await store.getApiKeyByHash("H"))?.revokedAt).not.toBeNull();
  });
});
