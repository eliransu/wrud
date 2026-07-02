/**
 * Query-string -> SessionFilter, shared by GET /sessions and the reports routes so the
 * filter language is parsed in exactly one place. Every facet dim accepts a comma-separated
 * list (OR within a dim, AND across dims); plus created_at range, token floors, and hasError.
 */
import { FACET_DIMS, sessionStatusSchema } from "@wrud/shared";
import type { SessionFilter, FacetDim, SessionStatus } from "@wrud/shared";

/** Positive-integer limit clamped to `max`; undefined for missing/invalid (incl. 0). */
export function clampLimit(
  raw: string | undefined,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), max);
}

const splitCsv = (v?: string): string[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const nonNegInt = (v?: string): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
};

/** Max distinct values accepted per dimension - bounds the IN-list (DoS guard). */
const MAX_VALUES_PER_DIM = 50;

export function parseSessionFilter(
  q: Record<string, string>,
  maxLimit = 200,
): SessionFilter {
  const facets: Partial<Record<FacetDim, string[]>> = {};
  for (const dim of FACET_DIMS) {
    const vals = splitCsv(q[dim]).slice(0, MAX_VALUES_PER_DIM);
    if (vals.length) facets[dim] = vals;
  }
  const statuses = splitCsv(q.status).filter(
    (s) => sessionStatusSchema.safeParse(s).success,
  ) as SessionStatus[];

  return {
    facets: Object.keys(facets).length ? facets : undefined,
    status: statuses.length ? statuses : undefined,
    from: q.from || undefined,
    to: q.to || undefined,
    minInputTokens: nonNegInt(q.minInputTokens),
    minOutputTokens: nonNegInt(q.minOutputTokens),
    hasError: q.hasError === "true" || q.hasError === "1" ? true : undefined,
    limit: clampLimit(q.limit, maxLimit),
    cursor: q.cursor || null,
    offset: nonNegInt(q.offset),
  };
}
