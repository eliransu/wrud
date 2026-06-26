/**
 * computeOverview - goal #4 (enterprise/org tracking). Aggregates across all sessions and
 * their summaries into a single rollup: session counts by status, per-model usage, insight
 * counts by type, and total lessons. Scans storage (fine at local scale); a hosted adapter
 * would push this down into SQL.
 */
import type { StorageAdapter, Session, Overview } from "@wrud/shared";

/** Hard cap on sessions scanned per overview - bounds the O(N) scan (DoS guard). */
const MAX_OVERVIEW_SESSIONS = 5000;

async function allSessions(storage: StorageAdapter): Promise<Session[]> {
  const out: Session[] = [];
  let cursor: string | null = null;
  do {
    const page = await storage.listSessions({ limit: 500, cursor });
    out.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && out.length < MAX_OVERVIEW_SESSIONS);
  return out.slice(0, MAX_OVERVIEW_SESSIONS);
}

export async function computeOverview(
  storage: StorageAdapter,
): Promise<Overview> {
  const sessions = await allSessions(storage);

  const byStatus: Record<string, number> = {};
  for (const s of sessions) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;

  const models = new Map<
    string,
    {
      model: string;
      sessions: number;
      calls: number;
      inputTokens: number;
      outputTokens: number;
    }
  >();
  const insightsByType: Record<string, number> = {};
  let insightTotal = 0;

  for (const s of sessions) {
    const summary = await storage.getSummary(s.id);
    if (!summary) continue;
    for (const m of summary.stats.models) {
      const agg = models.get(m.model) ?? {
        model: m.model,
        sessions: 0,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      agg.sessions += 1;
      agg.calls += m.calls;
      agg.inputTokens += m.inputTokens;
      agg.outputTokens += m.outputTokens;
      models.set(m.model, agg);
    }
    for (const i of summary.insights) {
      insightsByType[i.type] = (insightsByType[i.type] ?? 0) + 1;
      insightTotal += 1;
    }
  }

  const lessons = await storage.listLessons({ limit: 500 });

  return {
    sessions: { total: sessions.length, byStatus },
    models: [...models.values()].sort(
      (a, b) => b.outputTokens - a.outputTokens,
    ),
    insights: { total: insightTotal, byType: insightsByType },
    lessons: { total: lessons.items.length }, // local scale: capped at one page (500)
  };
}
