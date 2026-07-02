/**
 * Strategy interfaces. Each gets a Memory* impl (tests) plus a real impl (server).
 * Storage/Summarizer/LessonSink are async so a future network backend drops in without
 * changing callers; RateLimiter is intentionally synchronous (in-process counter).
 *
 * NOTE: the `import type` from "./index.js" is load-bearing - index.js re-exports this
 * module, so a non-type import here would create a runtime circular reference. Keep it
 * `import type` (erased under verbatimModuleSyntax).
 */
import type {
  Session,
  SessionStatus,
  Event,
  SessionSummary,
  Insight,
  ApiKey,
  Lesson,
  FacetDim,
} from "./index.js";

export interface Page {
  limit?: number;
  cursor?: string | null;
  /** Numbered-page access: row offset into the ordered set. Ignored when `cursor` is set. */
  offset?: number;
  /** Sort direction over the natural order (seq for events). Default asc. */
  order?: "asc" | "desc";
}
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  /** Total rows matching the query (across all pages) - powers numbered pagination. */
  total?: number;
}

export interface SessionFilter {
  /** Convenience single-value fields - the adapter folds these into `facets`. */
  user?: string;
  agent?: string;
  model?: string;
  /** Multi-value facet filters: dim -> allowed values. OR within a dim, AND across dims. */
  facets?: Partial<Record<FacetDim, string[]>>;
  /** One status or several (OR). */
  status?: SessionStatus | SessionStatus[];
  from?: string; // createdAt >=
  to?: string; // createdAt <=
  minInputTokens?: number;
  minOutputTokens?: number;
  /** Only sessions that recorded at least one error event. */
  hasError?: boolean;
  limit?: number;
  cursor?: string | null;
  /** Numbered-page access: row offset into the ordered set. Ignored when `cursor` is set. */
  offset?: number;
}

/** A distinct facet value and how many sessions carry it - powers search-and-select UIs. */
export interface FacetCount {
  value: string;
  sessions: number;
}

/** Aggregate rollup over the sessions matching a filter - powers the Reports page. */
export interface ReportAggregate {
  total: number;
  /** Top values per dimension across the matched set (plus `status`, derived from the column). */
  byDim: Partial<Record<FacetDim | "status", FacetCount[]>>;
  /** Sessions per calendar day (UTC) across the matched set, ascending. */
  trend: { date: string; sessions: number }[];
}

/** Per-session rollup (token counters + models), for the sessions list. */
export interface SessionStats {
  events: number;
  models: string[];
  inputTokens: number;
  outputTokens: number;
}

export interface LessonFilter {
  scope?: "session" | "user" | "org";
  sessionId?: string;
  limit?: number;
  cursor?: string | null;
}

export interface StorageAdapter {
  createSession(s: Session): Promise<void>;
  getSession(id: string): Promise<Session | undefined>;
  listSessions(f: SessionFilter): Promise<Paginated<Session>>;
  /** Event count + model/token rollup per session id (for the list view). */
  sessionStats(ids: string[]): Promise<Record<string, SessionStats>>;
  /**
   * Distinct facet values + session counts. With `dim`, returns just that dimension
   * (optionally prefix-filtered by `q` for type-ahead); without, the top values of every
   * dimension. `status` is included as a synthetic dim (derived from the session column).
   */
  listFacets(opts?: {
    dim?: FacetDim | "status";
    q?: string;
    limit?: number;
  }): Promise<Partial<Record<FacetDim | "status", FacetCount[]>>>;
  /** Total + per-dimension top values + daily trend over the sessions matching `f`. */
  reportAggregate(
    f: SessionFilter,
    opts?: { topPerDim?: number },
  ): Promise<ReportAggregate>;
  setSessionStatus(
    id: string,
    status: SessionStatus,
    endedAt: string | null,
  ): Promise<void>;
  appendEvents(sessionId: string, events: Event[]): Promise<void>;
  getEvents(sessionId: string, page?: Page): Promise<Paginated<Event>>;
  saveSummary(s: SessionSummary): Promise<void>;
  getSummary(sessionId: string): Promise<SessionSummary | undefined>;
  createApiKey(k: ApiKey): Promise<void>;
  getApiKeyByHash(hash: string): Promise<ApiKey | undefined>;
  listApiKeys(): Promise<ApiKey[]>;
  revokeApiKey(id: string): Promise<void>;
  touchApiKey(id: string, at: string): Promise<void>;
  saveLesson(l: Lesson): Promise<void>;
  listLessons(f: LessonFilter): Promise<Paginated<Lesson>>;
}

export interface Summarizer {
  version: string;
  summarize(session: Session, events: Event[]): Promise<SessionSummary>;
}

export interface RateLimiter {
  check(key: string): { ok: boolean; retryAfterMs?: number };
}

export interface InsightAnalyzer {
  analyze(summary: SessionSummary, events: Event[]): Insight[];
}

export interface LessonSink {
  emit(lesson: Lesson): Promise<void>;
}

/** App-wide clock; production passes () => new Date(), tests pass a fixed clock. */
export type Clock = () => Date;
