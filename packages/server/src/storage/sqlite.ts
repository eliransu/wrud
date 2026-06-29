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
import {
  FACET_DIMS,
  sessionFacets,
  eventFacets,
  eventTokens,
} from "@wrud/shared";
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
  Facet,
  FacetDim,
  FacetCount,
  ReportAggregate,
} from "@wrud/shared";

export class SqliteStorageAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(path = "./wrud.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA_SQL);
    this.ensureColumns(); // add rollup columns to DBs created before this feature
    this.backfillFacets(); // populate the facet index for pre-existing sessions, once
  }

  /** ALTER in the rollup counters for an old `sessions` table (CREATE IF NOT EXISTS is a no-op there). */
  private ensureColumns() {
    const cols = new Set(
      (this.db.prepare(`PRAGMA table_info(sessions)`).all() as any[]).map(
        (r) => r.name,
      ),
    );
    for (const ddl of [
      "event_count INTEGER NOT NULL DEFAULT 0",
      "input_tokens INTEGER NOT NULL DEFAULT 0",
      "output_tokens INTEGER NOT NULL DEFAULT 0",
    ]) {
      const name = ddl.split(" ")[0]!;
      if (!cols.has(name))
        this.db.exec(`ALTER TABLE sessions ADD COLUMN ${ddl}`);
    }
  }

  private insertFacets(sessionId: string, facets: Facet[]) {
    if (!facets.length) return;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO session_facets (session_id, dim, value) VALUES (?,?,?)`,
    );
    for (const f of facets) stmt.run(sessionId, f.dim, f.value);
  }

  /** One-time: derive facets + counters from existing rows. Skips once the index is non-empty. */
  private backfillFacets() {
    const facetN = (
      this.db.prepare(`SELECT COUNT(*) n FROM session_facets`).get() as any
    ).n;
    const sessionN = (
      this.db.prepare(`SELECT COUNT(*) n FROM sessions`).get() as any
    ).n;
    if (facetN > 0 || sessionN === 0) return;
    const tx = this.db.transaction(() => {
      const sessions = (
        this.db.prepare(`SELECT * FROM sessions`).all() as any[]
      ).map(this.rowToSession);
      const upd = this.db.prepare(
        `UPDATE sessions SET event_count = ?, input_tokens = ?, output_tokens = ? WHERE id = ?`,
      );
      for (const s of sessions) {
        this.insertFacets(s.id, sessionFacets(s));
        const evs = this.db
          .prepare(`SELECT type, payload_json FROM events WHERE session_id = ?`)
          .all(s.id) as any[];
        let dIn = 0,
          dOut = 0;
        for (const r of evs) {
          const e = {
            type: r.type,
            payload: JSON.parse(r.payload_json),
          } as Event;
          this.insertFacets(s.id, eventFacets(e));
          const t = eventTokens(e);
          dIn += t.input;
          dOut += t.output;
        }
        upd.run(evs.length, dIn, dOut, s.id);
      }
    });
    tx();
  }

  /**
   * SQL WHERE clauses + named params for a SessionFilter. Shared by listSessions and
   * reportAggregate so the filter language is defined once. Convenience single-value fields
   * (user/agent/model) fold into the facet map. Facets: OR within a dim, AND across dims.
   */
  private buildFilterClauses(f: SessionFilter): {
    clauses: string[];
    params: Record<string, unknown>;
  } {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    const facets: Partial<Record<string, string[]>> = {};
    for (const [dim, vals] of Object.entries(f.facets ?? {}))
      if (vals?.length) facets[dim] = [...vals];
    const addSingle = (dim: string, v?: string) => {
      if (v) facets[dim] = [...(facets[dim] ?? []), v];
    };
    addSingle("user", f.user);
    addSingle("agent", f.agent);
    addSingle("model", f.model);

    for (const [dim, vals] of Object.entries(facets)) {
      if (!vals?.length) continue;
      params[`dim_${dim}`] = dim;
      const ph = vals.map((v, i) => {
        params[`fv_${dim}_${i}`] = v;
        return `@fv_${dim}_${i}`;
      });
      clauses.push(
        `id IN (SELECT session_id FROM session_facets WHERE dim = @dim_${dim} AND value IN (${ph.join(",")}))`,
      );
    }

    if (f.status) {
      const statuses = Array.isArray(f.status) ? f.status : [f.status];
      const ph = statuses.map((s, i) => {
        params[`st_${i}`] = s;
        return `@st_${i}`;
      });
      clauses.push(`status IN (${ph.join(",")})`);
    }
    if (f.from) {
      clauses.push("created_at >= @from");
      params.from = f.from;
    }
    if (f.to) {
      clauses.push("created_at <= @to");
      params.to = f.to;
    }
    if (f.minInputTokens != null) {
      clauses.push("input_tokens >= @minIn");
      params.minIn = f.minInputTokens;
    }
    if (f.minOutputTokens != null) {
      clauses.push("output_tokens >= @minOut");
      params.minOut = f.minOutputTokens;
    }
    if (f.hasError)
      clauses.push(
        "id IN (SELECT session_id FROM session_facets WHERE dim = 'error_kind')",
      );

    return { clauses, params };
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
    this.insertFacets(s.id, sessionFacets(s)); // user + agent dims
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
    const { clauses, params } = this.buildFilterClauses(f);
    const limit = f.limit ?? 50;
    // Keyset pagination on (created_at, id) DESC - the cursor is the last row's
    // `${createdAt}__${id}`. Indexed by idx_sessions_created; no JS slicing of the full set.
    if (f.cursor) {
      const sep = f.cursor.indexOf("__");
      params.curTs = f.cursor.slice(0, sep);
      params.curId = f.cursor.slice(sep + 2);
      clauses.push(
        "(created_at < @curTs OR (created_at = @curTs AND id < @curId))",
      );
    }
    const whereSql = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const rows = (
      this.db
        .prepare(
          `SELECT * FROM sessions ${whereSql} ORDER BY created_at DESC, id DESC LIMIT @lim`,
        )
        .all({ ...params, lim: limit + 1 }) as any[]
    ) // fetch one extra to detect "more"
      .map(this.rowToSession);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? `${last.createdAt}__${last.id}` : null;
    return { items, nextCursor };
  }

  async sessionStats(ids: string[]): Promise<Record<string, SessionStats>> {
    const out: Record<string, SessionStats> = {};
    if (!ids.length) return out;
    for (const id of ids)
      out[id] = { events: 0, models: [], inputTokens: 0, outputTokens: 0 };
    const ph = ids.map(() => "?").join(",");
    // Counters live on the row (maintained in appendEvents) - no event scan.
    for (const r of this.db
      .prepare(
        `SELECT id, event_count, input_tokens, output_tokens FROM sessions WHERE id IN (${ph})`,
      )
      .all(...ids) as any[]) {
      const s = out[r.id];
      if (!s) continue;
      s.events = r.event_count;
      s.inputTokens = r.input_tokens;
      s.outputTokens = r.output_tokens;
    }
    // Models come from the facet index.
    for (const r of this.db
      .prepare(
        `SELECT session_id, value FROM session_facets WHERE dim = 'model' AND session_id IN (${ph})`,
      )
      .all(...ids) as any[])
      out[r.session_id]?.models.push(r.value);
    return out;
  }

  async listFacets(
    opts: { dim?: FacetDim | "status"; q?: string; limit?: number } = {},
  ): Promise<Partial<Record<FacetDim | "status", FacetCount[]>>> {
    const limit = opts.limit ?? 50;
    const dims = opts.dim ? [opts.dim] : [...FACET_DIMS, "status" as const];
    const out: Partial<Record<FacetDim | "status", FacetCount[]>> = {};
    for (const d of dims) {
      if (d === "status") {
        out.status = this.db
          .prepare(
            `SELECT status value, COUNT(*) sessions FROM sessions
             ${opts.q ? "WHERE status LIKE @q" : ""}
             GROUP BY status ORDER BY sessions DESC LIMIT @lim`,
          )
          .all(
            opts.q ? { q: `${opts.q}%`, lim: limit } : { lim: limit },
          ) as FacetCount[];
      } else {
        out[d] = this.db
          .prepare(
            `SELECT value, COUNT(DISTINCT session_id) sessions FROM session_facets
             WHERE dim = @dim ${opts.q ? "AND value LIKE @q" : ""}
             GROUP BY value ORDER BY sessions DESC, value LIMIT @lim`,
          )
          .all(
            opts.q
              ? { dim: d, q: `${opts.q}%`, lim: limit }
              : { dim: d, lim: limit },
          ) as FacetCount[];
      }
    }
    return out;
  }

  async reportAggregate(
    f: SessionFilter,
    opts: { topPerDim?: number } = {},
  ): Promise<ReportAggregate> {
    const top = opts.topPerDim ?? 10;
    const { clauses, params } = this.buildFilterClauses(f);
    const whereSql = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const matchIds = `SELECT id FROM sessions ${whereSql}`;

    const total = (
      this.db
        .prepare(`SELECT COUNT(*) n FROM sessions ${whereSql}`)
        .get(params) as any
    ).n as number;

    const byDim: ReportAggregate["byDim"] = {};
    for (const d of FACET_DIMS) {
      const rows = this.db
        .prepare(
          `SELECT value, COUNT(DISTINCT session_id) sessions FROM session_facets
           WHERE dim = @__dim AND session_id IN (${matchIds})
           GROUP BY value ORDER BY sessions DESC, value LIMIT @__top`,
        )
        .all({ ...params, __dim: d, __top: top }) as FacetCount[];
      if (rows.length) byDim[d] = rows;
    }
    const statusRows = this.db
      .prepare(
        `SELECT status value, COUNT(*) sessions FROM sessions ${whereSql}
         GROUP BY status ORDER BY sessions DESC`,
      )
      .all(params) as FacetCount[];
    if (statusRows.length) byDim.status = statusRows;

    const trend = this.db
      .prepare(
        `SELECT substr(created_at,1,10) date, COUNT(*) sessions FROM sessions ${whereSql}
         GROUP BY date ORDER BY date`,
      )
      .all(params) as { date: string; sessions: number }[];

    return { total, byDim, trend };
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
    const insEvent = this.db.prepare(
      `INSERT OR IGNORE INTO events (session_id, seq, id, timestamp, type, payload_json)
       VALUES (?,?,?,?,?,?)`,
    );
    const insFacet = this.db.prepare(
      `INSERT OR IGNORE INTO session_facets (session_id, dim, value) VALUES (?,?,?)`,
    );
    const bump = this.db.prepare(
      `UPDATE sessions SET event_count = event_count + @n,
         input_tokens = input_tokens + @in, output_tokens = output_tokens + @out
       WHERE id = @id`,
    );
    const tx = this.db.transaction((evs: Event[]) => {
      let n = 0,
        dIn = 0,
        dOut = 0;
      for (const e of evs) {
        const info = insEvent.run(
          sessionId,
          e.seq,
          e.id,
          e.timestamp,
          e.type,
          JSON.stringify(e.payload),
        );
        if (info.changes === 0) continue; // duplicate seq - don't double-count facets/tokens
        n += 1;
        for (const f of eventFacets(e)) insFacet.run(sessionId, f.dim, f.value);
        const t = eventTokens(e);
        dIn += t.input;
        dOut += t.output;
      }
      if (n) bump.run({ id: sessionId, n, in: dIn, out: dOut });
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
