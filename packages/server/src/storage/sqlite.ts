/**
 * SqliteStorageAdapter - the default, local StorageAdapter (better-sqlite3).
 * better-sqlite3 is synchronous; the StorageAdapter interface is async, so each
 * method wraps its synchronous work in a resolved promise. Nested objects are stored
 * as JSON text and parsed back through the same shapes the schemas describe.
 *
 * Pass ":memory:" for tests, or a file path (e.g. "./wrud.db") for a persistent store.
 * Schema is applied from the SCHEMA_SQL constant at construction.
 *
 * The `any` row casts are deliberate at the DB boundary - better-sqlite3 returns
 * `unknown` rows; we map them through typed row->entity helpers.
 */
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema.js";
import type {
  StorageAdapter,
  Session,
  SessionStatus,
  Event,
  SessionSummary,
  ApiKey,
  Lesson,
  SessionFilter,
  SessionStats,
  LessonFilter,
  Paginated,
  Page,
} from "@wrud/shared";

export class SqliteStorageAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(path = "./wrud.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA_SQL);
  }

  async createSession(s: Session) {
    this.db
      .prepare(
        `INSERT INTO sessions (id, api_key_id, user_id, user_json, agent_json, runtime_json, metadata_json, status, started_at, ended_at, created_at)
         VALUES (@id,@apiKeyId,@userId,@userJson,@agentJson,@runtimeJson,@metadataJson,@status,@startedAt,@endedAt,@createdAt)`,
      )
      .run({
        id: s.id,
        apiKeyId: s.apiKeyId,
        userId: s.user.id,
        userJson: JSON.stringify(s.user),
        agentJson: JSON.stringify(s.agent),
        runtimeJson: JSON.stringify(s.runtime),
        metadataJson: JSON.stringify(s.metadata),
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        createdAt: s.createdAt,
      });
  }

  private rowToSession = (r: any): Session => ({
    id: r.id,
    apiKeyId: r.api_key_id,
    user: JSON.parse(r.user_json),
    agent: JSON.parse(r.agent_json),
    runtime: JSON.parse(r.runtime_json),
    metadata: JSON.parse(r.metadata_json),
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    createdAt: r.created_at,
  });

  async getSession(id: string) {
    const r = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
    return r ? this.rowToSession(r) : undefined;
  }

  async listSessions(f: SessionFilter): Promise<Paginated<Session>> {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (f.user) {
      where.push("user_id = @user");
      params.user = f.user;
    }
    if (f.agent) {
      where.push("json_extract(agent_json, '$.name') = @agent");
      params.agent = f.agent;
    }
    if (f.model) {
      where.push(
        "id IN (SELECT session_id FROM events WHERE type = 'model_use' AND json_extract(payload_json, '$.model') = @model)",
      );
      params.model = f.model;
    }
    if (f.status) {
      where.push("status = @status");
      params.status = f.status;
    }
    if (f.from) {
      where.push("created_at >= @from");
      params.from = f.from;
    }
    if (f.to) {
      where.push("created_at <= @to");
      params.to = f.to;
    }
    const limit = f.limit ?? 50;
    // Phase 1 (local scale): fetch matching rows, slice in JS. Indexed keyset
    // pagination is a deliberate later optimization, not a bug.
    const rows = (
      this.db
        .prepare(
          `SELECT * FROM sessions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC, id DESC`,
        )
        .all(params) as any[]
    ).map(this.rowToSession);
    const start = f.cursor ? rows.findIndex((s) => s.id === f.cursor) + 1 : 0;
    const slice = rows.slice(start, start + limit);
    const nextCursor =
      start + limit < rows.length ? slice[slice.length - 1]!.id : null;
    return { items: slice, nextCursor };
  }

  async sessionStats(ids: string[]): Promise<Record<string, SessionStats>> {
    const out: Record<string, SessionStats> = {};
    if (!ids.length) return out;
    for (const id of ids)
      out[id] = { events: 0, models: [], inputTokens: 0, outputTokens: 0 };
    const ph = ids.map(() => "?").join(",");
    for (const r of this.db
      .prepare(
        `SELECT session_id, COUNT(*) n FROM events WHERE session_id IN (${ph}) GROUP BY session_id`,
      )
      .all(...ids) as any[]) {
      if (out[r.session_id]) out[r.session_id]!.events = r.n;
    }
    for (const r of this.db
      .prepare(
        `SELECT session_id, payload_json FROM events WHERE type = 'model_use' AND session_id IN (${ph})`,
      )
      .all(...ids) as any[]) {
      const s = out[r.session_id];
      if (!s) continue;
      const p = JSON.parse(r.payload_json);
      if (p.model && !s.models.includes(p.model)) s.models.push(p.model);
      s.inputTokens += p.inputTokens || 0;
      s.outputTokens += p.outputTokens || 0;
    }
    return out;
  }

  async setSessionStatus(
    id: string,
    status: SessionStatus,
    endedAt: string | null,
  ) {
    this.db
      .prepare(`UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?`)
      .run(status, endedAt, id);
  }

  async appendEvents(sessionId: string, events: Event[]) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO events (session_id, seq, id, timestamp, type, payload_json)
       VALUES (?,?,?,?,?,?)`,
    );
    const tx = this.db.transaction((evs: Event[]) => {
      for (const e of evs)
        stmt.run(
          sessionId,
          e.seq,
          e.id,
          e.timestamp,
          e.type,
          JSON.stringify(e.payload),
        );
    });
    tx(events);
  }

  async getEvents(sessionId: string, page?: Page): Promise<Paginated<Event>> {
    const rows = this.db
      .prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC`)
      .all(sessionId) as any[];
    const items = rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      seq: r.seq,
      timestamp: r.timestamp,
      type: r.type,
      payload: JSON.parse(r.payload_json),
    })) as Event[];
    const limit = page?.limit ?? 500;
    const start = page?.cursor
      ? items.findIndex((e) => e.id === page.cursor) + 1
      : 0;
    const slice = items.slice(start, start + limit);
    const nextCursor =
      start + limit < items.length ? slice[slice.length - 1]!.id : null;
    return { items: slice, nextCursor };
  }

  async saveSummary(s: SessionSummary) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO summaries (session_id, json) VALUES (?, ?)`,
      )
      .run(s.sessionId, JSON.stringify(s));
  }
  async getSummary(sessionId: string) {
    const r = this.db
      .prepare(`SELECT json FROM summaries WHERE session_id = ?`)
      .get(sessionId) as any;
    return r ? (JSON.parse(r.json) as SessionSummary) : undefined;
  }

  private rowToKey = (r: any): ApiKey => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    hash: r.hash,
    scopes: JSON.parse(r.scopes_json),
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  });
  async createApiKey(k: ApiKey) {
    this.db
      .prepare(
        `INSERT INTO api_keys (id, name, prefix, hash, scopes_json, created_at, last_used_at, revoked_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        k.id,
        k.name,
        k.prefix,
        k.hash,
        JSON.stringify(k.scopes),
        k.createdAt,
        k.lastUsedAt,
        k.revokedAt,
      );
  }
  async getApiKeyByHash(hash: string) {
    const r = this.db
      .prepare(`SELECT * FROM api_keys WHERE hash = ?`)
      .get(hash);
    return r ? this.rowToKey(r) : undefined;
  }
  async listApiKeys() {
    return (
      this.db
        .prepare(`SELECT * FROM api_keys ORDER BY created_at DESC`)
        .all() as any[]
    ).map(this.rowToKey);
  }
  async revokeApiKey(id: string) {
    this.db
      .prepare(
        `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
      )
      .run(new Date().toISOString(), id);
  }
  async touchApiKey(id: string, at: string) {
    this.db
      .prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
      .run(at, id);
  }

  private rowToLesson = (r: any): Lesson => ({
    id: r.id,
    sessionId: r.session_id ?? undefined,
    scope: r.scope,
    guidance: r.guidance,
    source: r.source,
    createdAt: r.created_at,
  });
  async saveLesson(l: Lesson) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO lessons (id, session_id, scope, guidance, source, created_at) VALUES (?,?,?,?,?,?)`,
      )
      .run(
        l.id,
        l.sessionId ?? null,
        l.scope,
        l.guidance,
        l.source,
        l.createdAt,
      );
  }
  async listLessons(f: LessonFilter): Promise<Paginated<Lesson>> {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (f.scope) {
      where.push("scope = @scope");
      params.scope = f.scope;
    }
    if (f.sessionId) {
      where.push("session_id = @sessionId");
      params.sessionId = f.sessionId;
    }
    const rows = (
      this.db
        .prepare(
          `SELECT * FROM lessons ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC, id DESC`,
        )
        .all(params) as any[]
    ).map(this.rowToLesson);
    const limit = f.limit ?? 100;
    const start = f.cursor ? rows.findIndex((l) => l.id === f.cursor) + 1 : 0;
    const slice = rows.slice(start, start + limit);
    const nextCursor =
      start + limit < rows.length ? slice[slice.length - 1]!.id : null;
    return { items: slice, nextCursor };
  }
}
