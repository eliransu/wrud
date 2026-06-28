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
} from "./index.js";

export interface Page {
  limit?: number;
  cursor?: string | null;
}
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SessionFilter {
  user?: string;
  agent?: string;
  model?: string;
  status?: SessionStatus;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string | null;
}

/** Per-session rollup derived from a session's events (model_use), for the sessions list. */
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
  /** Event count + model/token rollup per session id, derived from events (for the list view). */
  sessionStats(ids: string[]): Promise<Record<string, SessionStats>>;
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
