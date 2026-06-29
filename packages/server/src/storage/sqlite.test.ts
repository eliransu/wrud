import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
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

/* ---------- Facets, smart filters, reports (goals #1-3) ---------- */

const mk = (
  id: string,
  over: { user?: string; agent?: string; createdAt?: string } = {},
): Session => ({
  ...session(id),
  user: { id: over.user ?? "u1" },
  agent: { name: over.agent ?? "claude-code" },
  createdAt: over.createdAt ?? "2026-06-25T10:00:00.000Z",
});

const evt = (seq: number, type: Event["type"], payload: unknown): Event =>
  ({
    id: `e${seq}`,
    sessionId: "x",
    seq,
    timestamp: "2026-06-25T10:00:00.000Z",
    type,
    payload,
  }) as Event;

describe("SqliteStorageAdapter facets/filters/reports", () => {
  let store: SqliteStorageAdapter;
  beforeEach(() => {
    store = new SqliteStorageAdapter(":memory:");
  });

  it("filters by facets: AND across dims, OR within a dim", async () => {
    await store.createSession(mk("s1", { user: "alice" }));
    await store.appendEvents("s1", [
      evt(0, "tool_call", {
        name: "Skill",
        ok: true,
        input: { skill: "frontend-design" },
      }),
      evt(1, "tool_call", { name: "Edit", ok: true }),
      evt(2, "model_use", {
        model: "opus",
        inputTokens: 100,
        outputTokens: 200,
      }),
    ]);
    await store.createSession(mk("s2", { user: "bob" }));
    await store.appendEvents("s2", [
      evt(0, "tool_call", {
        name: "Skill",
        ok: true,
        input: { skill: "brainstorming" },
      }),
      evt(1, "model_use", {
        model: "haiku",
        inputTokens: 10,
        outputTokens: 20,
      }),
    ]);

    // OR within dim: skill in (frontend-design, brainstorming) -> both
    const both = await store.listSessions({
      facets: { skill: ["frontend-design", "brainstorming"] },
    });
    expect(both.items.map((s) => s.id).sort()).toEqual(["s1", "s2"]);

    // AND across dims: skill=brainstorming AND model=haiku -> only s2
    const and = await store.listSessions({
      facets: { skill: ["brainstorming"], model: ["haiku"] },
    });
    expect(and.items.map((s) => s.id)).toEqual(["s2"]);

    // contradiction -> empty
    const none = await store.listSessions({
      facets: { skill: ["frontend-design"], model: ["haiku"] },
    });
    expect(none.items).toEqual([]);
  });

  it("filters by token floor and hasError", async () => {
    await store.createSession(mk("s1"));
    await store.appendEvents("s1", [
      evt(0, "model_use", { model: "opus", inputTokens: 0, outputTokens: 500 }),
    ]);
    await store.createSession(mk("s2"));
    await store.appendEvents("s2", [
      evt(0, "model_use", { model: "opus", inputTokens: 0, outputTokens: 5 }),
      evt(1, "error", { message: "boom", kind: "timeout" }),
    ]);

    expect(
      (await store.listSessions({ minOutputTokens: 100 })).items.map(
        (s) => s.id,
      ),
    ).toEqual(["s1"]);
    expect(
      (await store.listSessions({ hasError: true })).items.map((s) => s.id),
    ).toEqual(["s2"]);
  });

  it("keyset-paginates (created_at, id) DESC without dropping rows", async () => {
    for (let i = 0; i < 5; i++)
      await store.createSession(
        mk(`s${i}`, { createdAt: `2026-06-25T10:0${i}:00.000Z` }),
      );
    const p1 = await store.listSessions({ limit: 2 });
    expect(p1.items.map((s) => s.id)).toEqual(["s4", "s3"]);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await store.listSessions({ limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((s) => s.id)).toEqual(["s2", "s1"]);
    const p3 = await store.listSessions({ limit: 2, cursor: p2.nextCursor });
    expect(p3.items.map((s) => s.id)).toEqual(["s0"]);
    expect(p3.nextCursor).toBeNull();
  });

  it("sessionStats reads counters + model facets (no event scan)", async () => {
    await store.createSession(mk("s1"));
    await store.appendEvents("s1", [
      evt(0, "model_use", { model: "opus", inputTokens: 3, outputTokens: 7 }),
      evt(1, "model_use", { model: "haiku", inputTokens: 1, outputTokens: 2 }),
      evt(1, "model_use", { model: "haiku", inputTokens: 1, outputTokens: 2 }), // dup seq
    ]);
    const stats = await store.sessionStats(["s1"]);
    expect(stats.s1!.events).toBe(2); // dup ignored
    expect(stats.s1!.inputTokens).toBe(4);
    expect(stats.s1!.outputTokens).toBe(9);
    expect(stats.s1!.models.sort()).toEqual(["haiku", "opus"]);
  });

  it("listFacets returns distinct values + counts, with prefix search", async () => {
    await store.createSession(mk("s1", { user: "alice" }));
    await store.createSession(mk("s2", { user: "alice" }));
    await store.createSession(mk("s3", { user: "bob" }));
    const users = (await store.listFacets({ dim: "user" })).user!;
    expect(users).toEqual([
      { value: "alice", sessions: 2 },
      { value: "bob", sessions: 1 },
    ]);
    const search = (await store.listFacets({ dim: "user", q: "al" })).user!;
    expect(search.map((u) => u.value)).toEqual(["alice"]);
    // no dim -> every dimension present, incl. synthetic status
    const all = await store.listFacets();
    expect(all.status).toEqual([{ value: "open", sessions: 3 }]);
    expect(all.agent).toEqual([{ value: "claude-code", sessions: 3 }]);
  });

  it("reportAggregate totals, per-dim top values, status, and daily trend", async () => {
    await store.createSession(
      mk("s1", { user: "alice", createdAt: "2026-06-25T10:00:00.000Z" }),
    );
    await store.appendEvents("s1", [
      evt(0, "tool_call", { name: "Skill", ok: true, input: { skill: "x" } }),
    ]);
    await store.createSession(
      mk("s2", { user: "bob", createdAt: "2026-06-26T10:00:00.000Z" }),
    );
    await store.appendEvents("s2", [
      evt(0, "tool_call", { name: "Skill", ok: true, input: { skill: "x" } }),
    ]);
    await store.setSessionStatus(
      "s2",
      "summarized",
      "2026-06-26T11:00:00.000Z",
    );

    const agg = await store.reportAggregate({});
    expect(agg.total).toBe(2);
    expect(agg.byDim.skill).toEqual([{ value: "x", sessions: 2 }]);
    expect(
      agg.byDim.user!.sort((a, b) => (a.value < b.value ? -1 : 1)),
    ).toEqual([
      { value: "alice", sessions: 1 },
      { value: "bob", sessions: 1 },
    ]);
    expect(agg.byDim.status).toContainEqual({ value: "open", sessions: 1 });
    expect(agg.byDim.status).toContainEqual({
      value: "summarized",
      sessions: 1,
    });
    expect(agg.trend).toEqual([
      { date: "2026-06-25", sessions: 1 },
      { date: "2026-06-26", sessions: 1 },
    ]);

    // a filtered aggregate narrows the matched set
    const filtered = await store.reportAggregate({
      facets: { user: ["alice"] },
    });
    expect(filtered.total).toBe(1);
    expect(filtered.byDim.user).toEqual([{ value: "alice", sessions: 1 }]);
  });

  it("backfills facets + counters for a DB written before the feature", async () => {
    const path = join(
      tmpdir(),
      `wrud-backfill-${process.pid}-${Math.random()}.db`,
    );
    try {
      const a = new SqliteStorageAdapter(path);
      // Insert rows the legacy way: straight SQL, bypassing facet maintenance.
      const db = (a as any).db;
      db.prepare(
        `INSERT INTO sessions (id, api_key_id, user_id, user_json, agent_json, runtime_json, metadata_json, status, started_at, ended_at, created_at)
         VALUES ('old','k','u9',?,?,'{}','{}','open','2026-06-25T10:00:00.000Z',NULL,'2026-06-25T10:00:00.000Z')`,
      ).run(JSON.stringify({ id: "u9" }), JSON.stringify({ name: "cursor" }));
      db.prepare(
        `INSERT INTO events (session_id, seq, id, timestamp, type, payload_json)
         VALUES ('old',0,'e0','2026-06-25T10:00:00.000Z','model_use',?)`,
      ).run(
        JSON.stringify({ model: "sonnet", inputTokens: 4, outputTokens: 8 }),
      );
      db.prepare(`DELETE FROM session_facets`).run(); // ensure index is empty

      // Reopen -> constructor backfill runs.
      const b = new SqliteStorageAdapter(path);
      expect(
        (await b.listSessions({ facets: { model: ["sonnet"] } })).items.map(
          (s) => s.id,
        ),
      ).toEqual(["old"]);
      const stats = await b.sessionStats(["old"]);
      expect(stats.old!.events).toBe(1);
      expect(stats.old!.outputTokens).toBe(8);
      expect((await b.listFacets({ dim: "agent" })).agent).toEqual([
        { value: "cursor", sessions: 1 },
      ]);
    } finally {
      for (const ext of ["", "-wal", "-shm"])
        rmSync(path + ext, { force: true });
    }
  });
});
