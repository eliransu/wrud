/**
 * Facet extraction - the single source of truth for the queryable dimensions a session
 * carries. Storage adapters call these to maintain the denormalized `session_facets`
 * index (and the per-session token counters) incrementally as events arrive, so filters
 * and reports become indexed lookups instead of full-table JSON scans.
 *
 * `import type` from "./index.js" stays type-only: index.js re-exports this module, so a
 * runtime import would be circular (same reason interfaces.ts does it).
 */
import type { Session, Event, SessionSummary } from "./index.js";

/**
 * The facet dimensions. Each is low-cardinality enough to enumerate ("search and select").
 * `status` is intentionally NOT here - it lives as an indexed column on the session row
 * and mutates over the lifecycle, so faceting it would mean rewriting facet rows. Token
 * totals and timestamps are continuous, handled as range predicates, not facets.
 */
export const FACET_DIMS = [
  "user", // session.user.id
  "agent", // session.agent.name
  "project", // basename of session.runtime.cwd (a fact, not a guess)
  "model", // model_use.model
  "topic", // LLM-derived 2-5 word label (from the summary; absent without a narrator)
  "category", // LLM-derived fixed-enum category (from the summary)
  "tool", // tool_call.name (excluding Skill + mcp__*)
  "mcp", // mcp__server__tool calls (extensions)
  "skill", // the Skill tool's input.skill
  "command", // /slash-commands typed by the user
  "file_ext", // extension of a changed file
  "error_kind", // error.kind (or "error" when unspecified)
] as const;
export type FacetDim = (typeof FACET_DIMS)[number];

export interface Facet {
  dim: FacetDim;
  value: string;
}

/** Facets fixed at session creation (who + which agent + which project) - these never change. */
export function sessionFacets(s: Session): Facet[] {
  const out: Facet[] = [];
  if (s.user?.id) out.push({ dim: "user", value: s.user.id });
  if (s.agent?.name) out.push({ dim: "agent", value: s.agent.name });
  const project = (s.runtime?.cwd ?? "").split(/[\\/]/).filter(Boolean).pop();
  if (project) out.push({ dim: "project", value: project });
  return out;
}

/** Facets a summary contributes (topic/category from the narrator; empty without one). */
export function summaryFacets(
  s: Pick<SessionSummary, "topic" | "category">,
): Facet[] {
  const out: Facet[] = [];
  if (s.topic) out.push({ dim: "topic", value: s.topic });
  if (s.category) out.push({ dim: "category", value: s.category });
  return out;
}

/** Facets a single event contributes. A session "has" the set-union across its events. */
export function eventFacets(e: Event): Facet[] {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case "model_use":
      return p.model ? [{ dim: "model", value: String(p.model) }] : [];
    case "tool_call": {
      const name = String(p.name ?? "");
      if (!name) return [];
      if (name.startsWith("mcp__")) return [{ dim: "mcp", value: name }];
      if (name === "Skill") {
        const s = skillArg(p.input);
        return s ? [{ dim: "skill", value: s }] : [];
      }
      return [{ dim: "tool", value: name }];
    }
    case "message": {
      if (p.role !== "user") return [];
      const cmd = slashCommand(p.text);
      return cmd ? [{ dim: "command", value: cmd }] : [];
    }
    case "file_change": {
      const ext = fileExt(String(p.path ?? ""));
      return ext ? [{ dim: "file_ext", value: ext }] : [];
    }
    case "error":
      return [{ dim: "error_kind", value: String(p.kind || "error") }];
    default:
      return [];
  }
}

/** Token deltas an event adds to the session's rollup counters. */
export function eventTokens(e: Event): { input: number; output: number } {
  if (e.type !== "model_use") return { input: 0, output: 0 };
  const p = e.payload as { inputTokens?: number; outputTokens?: number };
  return { input: p.inputTokens || 0, output: p.outputTokens || 0 };
}

/** The Skill tool's input may be a JSON string or an object; pull `.skill`. */
function skillArg(input: unknown): string {
  try {
    const o = typeof input === "string" ? JSON.parse(input) : input;
    const s =
      o && typeof o === "object" ? (o as { skill?: unknown }).skill : "";
    return s ? String(s) : "";
  } catch {
    return ""; // input not JSON - no skill to extract
  }
}

/** A leading `/command` in a user message, normalized lower-case so /Review == /review. */
function slashCommand(text: unknown): string {
  const m = /^\s*\/([a-zA-Z0-9:_-]+)/.exec(String(text ?? ""));
  return m ? "/" + m[1]!.toLowerCase() : "";
}

/** Lower-cased file extension (no dot), or "" for extensionless / dotfiles. */
function fileExt(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}
