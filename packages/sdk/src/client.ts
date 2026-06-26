/**
 * @wrud/sdk - thin client over the wrud HTTP API. The session handle accepts the ergonomic
 * flat event shape, assembles the wire envelope, buffers, and flushes in batches / on
 * summarize. event() is resilient by contract: it never throws into the host agent.
 *
 * Summarization has two modes (the caller picks; default "server"):
 *   - "server" (receiver): the server summarizes (deterministic + its own optional LLM).
 *   - "client" (caller): the SDK builds the summary locally using the SAME shared logic +
 *     SUMMARY_SYSTEM_PROMPT, optionally running your AI as the narrator, then PUTs the result.
 * Either way the system prompt is byte-identical (sourced from @wrud/shared).
 */
import {
  newId,
  eventSchema,
  buildBaseSummary,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
  type CreateSessionRequest,
  type Event,
  type EventType,
  type Session,
  type SessionSummary,
  type SummaryStats,
  type Insight,
} from "@wrud/shared";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Flat event input: { type, ...payloadFields } - the handle builds the wire envelope. */
export type WrudEventInput = { type: EventType } & Record<string, unknown>;

/** A caller-supplied narrator (your AI). Receives the SHARED prompts so output is consistent. */
export type WrudNarrator = (input: {
  systemPrompt: string;
  userPrompt: string;
  stats: SummaryStats;
  insights: Insight[];
}) => Promise<string>;

export interface SummarizeOptions {
  mode?: "server" | "client";
  narrator?: WrudNarrator;
}

export interface WrudClientOptions {
  baseUrl?: string; // default http://localhost:11190
  apiKey: string;
  fetch?: FetchLike; // injectable for tests
  flushAt?: number; // buffer threshold (default 50)
  summarize?: SummarizeOptions; // default summarization behavior
}

export function createWrudClient(opts: WrudClientOptions) {
  const baseUrl = (opts.baseUrl ?? "http://localhost:11190").replace(/\/$/, "");
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const headers = {
    authorization: `Bearer ${opts.apiKey}`,
    "content-type": "application/json",
  };
  const defaults = opts.summarize ?? {};

  async function request(
    method: string,
    path: string,
    jsonBody?: unknown,
  ): Promise<any> {
    const res = await doFetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
    });
    if (!res.ok) throw new Error(`wrud ${method} ${path} -> ${res.status}`);
    return res.status === 204 ? undefined : res.json();
  }

  return {
    async startSession(req: CreateSessionRequest) {
      const { sessionId } = await request("POST", "/v1/sessions", req);
      return new SessionHandle(
        sessionId,
        request,
        opts.flushAt ?? 50,
        0,
        defaults,
      );
    },
    /**
     * Bind a handle to an EXISTING session - for cross-process integrations (e.g. an agent's
     * lifecycle hooks) where each hook is a fresh process. Pass `startSeq` (the persisted cursor) so
     * `seq` stays monotonic and the (sessionId, seq) idempotency key doesn't collide at 0.
     */
    resumeSession(sessionId: string, startSeq = 0) {
      return new SessionHandle(
        sessionId,
        request,
        opts.flushAt ?? 50,
        startSeq,
        defaults,
      );
    },
  };
}

class SessionHandle {
  private buffer: Event[] = []; // unflushed events
  private all: Event[] = []; // every accepted event (for client-mode summary)
  private seq: number;
  private dropped = 0;
  constructor(
    public readonly sessionId: string,
    private request: (m: string, p: string, b?: unknown) => Promise<any>,
    private flushAt: number,
    startSeq: number,
    private summarizeDefaults: SummarizeOptions,
  ) {
    this.seq = startSeq;
  }

  /** The next seq this handle will assign - persist it across processes to avoid collisions. */
  get nextSeq(): number {
    return this.seq;
  }
  get droppedCount(): number {
    return this.dropped;
  }

  /** Buffer one event. Never throws - malformed events are validated, dropped, counted. */
  event(flat: WrudEventInput): void {
    try {
      const { type, ...payload } = flat;
      const wire = {
        id: newId(),
        sessionId: this.sessionId,
        seq: this.seq,
        timestamp: new Date().toISOString(),
        type,
        payload,
      };
      const parsed = eventSchema.safeParse(wire);
      if (!parsed.success) {
        this.dropped++;
        return;
      }
      this.buffer.push(parsed.data);
      this.all.push(parsed.data);
      this.seq++;
      if (this.buffer.length >= this.flushAt) void this.flush();
    } catch {
      this.dropped++;
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    await this.request("POST", `/v1/sessions/${this.sessionId}/events`, {
      events: batch,
    });
  }

  async summarize(override?: SummarizeOptions): Promise<SessionSummary> {
    await this.flush();
    const mode = override?.mode ?? this.summarizeDefaults.mode ?? "server";

    if (mode === "server") {
      return this.request("POST", `/v1/sessions/${this.sessionId}/summarize`, {
        mode: "server",
      });
    }

    // Client mode: park status, build the summary locally with shared logic + your AI, store it.
    const narrator = override?.narrator ?? this.summarizeDefaults.narrator;
    await this.request("POST", `/v1/sessions/${this.sessionId}/summarize`, {
      mode: "client",
    });
    const base = buildBaseSummary(
      { id: this.sessionId } as Session,
      this.all,
      new Date(),
    );
    // Start from the deterministic narrative so a narrator failure degrades gracefully
    // (keeps a real summary) instead of nulling it out.
    let narrative: string | null = base.narrative;
    if (narrator) {
      try {
        narrative = await narrator({
          systemPrompt: SUMMARY_SYSTEM_PROMPT,
          userPrompt: buildSummaryUserPrompt(
            base.stats,
            base.insights,
            this.all,
          ),
          stats: base.stats,
          insights: base.insights,
        });
      } catch {
        /* keep the deterministic base.narrative */
      }
    }
    const summary: SessionSummary = {
      ...base,
      narrative,
      summarizerVersion: narrator ? "client-ai@1" : "client-deterministic@1",
      summarizedBy: "client",
    };
    return this.request("PUT", `/v1/sessions/${this.sessionId}/summary`, {
      summary,
    });
  }
}
