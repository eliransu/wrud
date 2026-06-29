/**
 * Reports + facets routes (scope: read) - goals #2 and #3.
 *   GET /v1/facets           distinct values + session counts per dim (search-and-select)
 *   GET /v1/reports/summary  total + per-dim top values + daily trend over a filter
 * Both lean on the indexed session_facets table; the filter language is shared with
 * GET /v1/sessions via parseSessionFilter, so the Reports page and the Sessions list speak
 * the same query string (the page fetches /sessions for the table and /reports/summary for charts).
 */
import { Hono } from "hono";
import { FACET_DIMS } from "@wrud/shared";
import type { FacetDim } from "@wrud/shared";
import type { AppEnv } from "../app.js";
import { requireScope } from "./auth-middleware.js";
import { parseSessionFilter, clampLimit } from "./filter.js";

export const reportRoutes = new Hono<AppEnv>();

const DIMS = new Set<string>([...FACET_DIMS, "status"]);

reportRoutes.get("/facets", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const q = c.req.query();
  const dim =
    q.dim && DIMS.has(q.dim) ? (q.dim as FacetDim | "status") : undefined;
  const search = q.q && q.q.length <= 128 ? q.q : undefined;
  const facets = await storage.listFacets({
    dim,
    q: search,
    limit: clampLimit(q.limit, 500) ?? 50,
  });
  return c.json(facets, 200);
});

reportRoutes.get("/reports/summary", requireScope("read"), async (c) => {
  const { storage } = c.get("deps");
  const topPerDim = clampLimit(c.req.query().top, 50) ?? 10;
  const agg = await storage.reportAggregate(parseSessionFilter(c.req.query()), {
    topPerDim,
  });
  return c.json(agg, 200);
});
