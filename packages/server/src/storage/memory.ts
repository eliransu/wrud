/**
 * MemoryStorageAdapter - Map-backed StorageAdapter for tests and ephemeral local runs.
 * Deep-clones on the way in/out so callers can't mutate stored records by reference.
 */
import {
  FACET_DIMS,
  sessionFacets,
  eventFacets,
  eventTokens,
  summaryFacets,
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

const clone = <T>(v: T): T => structuredClone(v);

/** value->count map -> sorted [{value,sessions}] (desc count, then value asc), top `limit`. */
function rankCounts(counts: Map<string, number>, limit: number): FacetCount[] {
  return [...counts.entries()]
    .map(([value, sessions]) => ({ value, sessions }))
    .sort((a, b) => b.sessions - a.sessions || (a.value < b.value ? -1 : 1))
    .slice(0, limit === Infinity ? undefined : limit);
}

export class MemoryStorageAdapter implements StorageAdapter {
  private sessions = new Map<string, Session>();
  private events = new Map<string, Map<number, Event>>(); // sessionId -> seq -> event
  private summaries = new Map<string, SessionSummary>();
  private keys = new Map<string, ApiKey>(); // id -> key
  private lessons = new Map<string, Lesson>();

  async createSession(s: Session) {
    this.sessions.set(s.id, clone(s));
  }
  async getSession(id: string) {
    const s = this.sessions.get(id);
    return s ? clone(s) : undefined;
  }

  /** The full facet set of a session (creation facets + event union + summary facets). */
  private facetsOf(s: Session): Facet[] {
    const out = [...sessionFacets(s)];
    for (const e of this.events.get(s.id)?.values() ?? [])
      out.push(...eventFacets(e));
    const sum = this.summaries.get(s.id);
    if (sum) out.push(...summaryFacets(sum));
    return out;
  }
  private tokensOf(s: Session): { input: number; output: number } {
    let input = 0,
      output = 0;
    for (const e of this.events.get(s.id)?.values() ?? []) {
      const t = eventTokens(e);
      input += t.input;
      output += t.output;
    }
    return { input, output };
  }
  private matches(s: Session, f: SessionFilter): boolean {
    const want: Record<string, string[]> = {};
    for (const [d, v] of Object.entries(f.facets ?? {}))
      if (v?.length) want[d] = [...v];
    if (f.user) (want.user ??= []).push(f.user);
    if (f.agent) (want.agent ??= []).push(f.agent);
    if (f.model) (want.model ??= []).push(f.model);
    const have = this.facetsOf(s);
    for (const [dim, vals] of Object.entries(want))
      if (!vals.some((v) => have.some((h) => h.dim === dim && h.value === v)))
        return false;
    if (f.status) {
      const st = Array.isArray(f.status) ? f.status : [f.status];
      if (!st.includes(s.status)) return false;
    }
    if (f.from && s.createdAt < f.from) return false;
    if (f.to && s.createdAt > f.to) return false;
    if (f.minInputTokens != null || f.minOutputTokens != null) {
      const t = this.tokensOf(s);
      if (f.minInputTokens != null && t.input < f.minInputTokens) return false;
      if (f.minOutputTokens != null && t.output < f.minOutputTokens)
        return false;
    }
    if (f.hasError && !have.some((h) => h.dim === "error_kind")) return false;
    return true;
  }

  async listSessions(f: SessionFilter): Promise<Paginated<Session>> {
    // created_at DESC, id DESC - same total order as the SQLite adapter.
    const all = [...this.sessions.values()]
      .filter((s) => this.matches(s, f))
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id < b.id
            ? 1
            : -1
          : a.createdAt < b.createdAt
            ? 1
            : -1,
      );
    let start = 0;
    if (f.cursor) {
      const sep = f.cursor.indexOf("__");
      const ts = f.cursor.slice(0, sep);
      const cid = f.cursor.slice(sep + 2);
      const i = all.findIndex(
        (s) => s.createdAt < ts || (s.createdAt === ts && s.id < cid),
      );
      start = i < 0 ? all.length : i;
    }
    const limit = f.limit ?? 50;
    const slice = all.slice(start, start + limit);
    const last = slice[slice.length - 1];
    const hasMore = start + limit < all.length;
    const nextCursor = hasMore && last ? `${last.createdAt}__${last.id}` : null;
    return { items: slice.map(clone), nextCursor };
  }

  async listFacets(
    opts: { dim?: FacetDim | "status"; q?: string; limit?: number } = {},
  ): Promise<Partial<Record<FacetDim | "status", FacetCount[]>>> {
    const limit = opts.limit ?? 50;
    const dims = opts.dim ? [opts.dim] : [...FACET_DIMS, "status" as const];
    const out: Partial<Record<FacetDim | "status", FacetCount[]>> = {};
    for (const d of dims) {
      const counts = new Map<string, number>();
      for (const s of this.sessions.values()) {
        const vals =
          d === "status"
            ? new Set([s.status])
            : new Set(
                this.facetsOf(s)
                  .filter((f) => f.dim === d)
                  .map((f) => f.value),
              );
        for (const v of vals) {
          if (opts.q && !v.startsWith(opts.q)) continue;
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
      out[d] = rankCounts(counts, limit);
    }
    return out;
  }

  async reportAggregate(
    f: SessionFilter,
    opts: { topPerDim?: number } = {},
  ): Promise<ReportAggregate> {
    const top = opts.topPerDim ?? 10;
    const matched = [...this.sessions.values()].filter((s) =>
      this.matches(s, f),
    );
    const byDim: ReportAggregate["byDim"] = {};
    for (const d of FACET_DIMS) {
      const counts = new Map<string, number>();
      for (const s of matched)
        for (const v of new Set(
          this.facetsOf(s)
            .filter((x) => x.dim === d)
            .map((x) => x.value),
        ))
          counts.set(v, (counts.get(v) ?? 0) + 1);
      const rows = rankCounts(counts, top);
      if (rows.length) byDim[d] = rows;
    }
    const statusCounts = new Map<string, number>();
    for (const s of matched)
      statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1);
    const statusRows = rankCounts(statusCounts, Infinity);
    if (statusRows.length) byDim.status = statusRows;

    const trendCounts = new Map<string, number>();
    for (const s of matched) {
      const day = s.createdAt.slice(0, 10);
      trendCounts.set(day, (trendCounts.get(day) ?? 0) + 1);
    }
    const trend = [...trendCounts.entries()]
      .map(([date, sessions]) => ({ date, sessions }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return { total: matched.length, byDim, trend };
  }

  async sessionStats(ids: string[]): Promise<Record<string, SessionStats>> {
    const out: Record<string, SessionStats> = {};
    for (const id of ids) {
      const evs = [...(this.events.get(id)?.values() ?? [])];
      const stat: SessionStats = {
        events: evs.length,
        models: [],
        inputTokens: 0,
        outputTokens: 0,
      };
      for (const e of evs) {
        if (e.type !== "model_use") continue;
        const p = e.payload as any;
        if (p?.model && !stat.models.includes(p.model))
          stat.models.push(p.model);
        stat.inputTokens += p?.inputTokens || 0;
        stat.outputTokens += p?.outputTokens || 0;
      }
      out[id] = stat;
    }
    return out;
  }

  async setSessionStatus(
    id: string,
    status: SessionStatus,
    endedAt: string | null,
  ) {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, status, endedAt });
  }

  async appendEvents(sessionId: string, events: Event[]) {
    const m = this.events.get(sessionId) ?? new Map<number, Event>();
    for (const e of events) if (!m.has(e.seq)) m.set(e.seq, clone(e)); // idempotent on seq
    this.events.set(sessionId, m);
  }

  async getEvents(sessionId: string, page?: Page): Promise<Paginated<Event>> {
    const all = [...(this.events.get(sessionId)?.values() ?? [])].sort(
      (a, b) => a.seq - b.seq,
    );
    const limit = page?.limit ?? 500;
    const start = page?.cursor
      ? all.findIndex((e) => e.id === page.cursor) + 1
      : 0;
    const slice = all.slice(start, start + limit);
    const nextCursor =
      start + limit < all.length ? slice[slice.length - 1]!.id : null;
    return { items: slice.map(clone), nextCursor };
  }

  async saveSummary(s: SessionSummary) {
    this.summaries.set(s.sessionId, clone(s));
  }
  async getSummary(sessionId: string) {
    const s = this.summaries.get(sessionId);
    return s ? clone(s) : undefined;
  }

  async createApiKey(k: ApiKey) {
    this.keys.set(k.id, clone(k));
  }
  async getApiKeyByHash(hash: string) {
    const k = [...this.keys.values()].find((x) => x.hash === hash);
    return k ? clone(k) : undefined;
  }
  async listApiKeys() {
    return [...this.keys.values()].map(clone);
  }
  async revokeApiKey(id: string) {
    const k = this.keys.get(id);
    if (k && !k.revokedAt)
      this.keys.set(id, { ...k, revokedAt: new Date().toISOString() });
  }
  async touchApiKey(id: string, at: string) {
    const k = this.keys.get(id);
    if (k) this.keys.set(id, { ...k, lastUsedAt: at });
  }

  async saveLesson(l: Lesson) {
    this.lessons.set(l.id, clone(l));
  }
  async listLessons(f: LessonFilter): Promise<Paginated<Lesson>> {
    const items = [...this.lessons.values()]
      .filter((l) => (f.scope ? l.scope === f.scope : true))
      .filter((l) => (f.sessionId ? l.sessionId === f.sessionId : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
    const limit = f.limit ?? 100;
    const start = f.cursor ? items.findIndex((l) => l.id === f.cursor) + 1 : 0;
    const slice = items.slice(start, start + limit);
    const nextCursor =
      start + limit < items.length ? slice[slice.length - 1]!.id : null;
    return { items: slice.map(clone), nextCursor };
  }
}
