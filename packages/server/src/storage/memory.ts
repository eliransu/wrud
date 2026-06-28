/**
 * MemoryStorageAdapter - Map-backed StorageAdapter for tests and ephemeral local runs.
 * Deep-clones on the way in/out so callers can't mutate stored records by reference.
 */
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

const clone = <T>(v: T): T => structuredClone(v);

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

  async listSessions(f: SessionFilter): Promise<Paginated<Session>> {
    const hasModel = (id: string, model: string) =>
      [...(this.events.get(id)?.values() ?? [])].some(
        (e) => e.type === "model_use" && (e.payload as any)?.model === model,
      );
    const items = [...this.sessions.values()]
      .filter((s) => (f.user ? s.user.id === f.user : true))
      .filter((s) => (f.agent ? s.agent.name === f.agent : true))
      .filter((s) => (f.model ? hasModel(s.id, f.model) : true))
      .filter((s) => (f.status ? s.status === f.status : true))
      .filter((s) => (f.from ? s.createdAt >= f.from : true))
      .filter((s) => (f.to ? s.createdAt <= f.to : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
    const limit = f.limit ?? 50;
    const start = f.cursor ? items.findIndex((s) => s.id === f.cursor) + 1 : 0;
    const slice = items.slice(start, start + limit);
    const nextCursor =
      start + limit < items.length ? slice[slice.length - 1]!.id : null;
    return { items: slice.map(clone), nextCursor };
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
