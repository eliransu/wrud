/**
 * lessonsFromInsights - goal #3 (teach the model/user). Turns a session's insights into
 * durable "lessons" that a future memory sink could feed back into an agent so the same
 * mistake doesn't recur. Pure: returns lesson drafts (no id/createdAt - the caller stamps
 * those with newId() + the injected clock).
 */
import type { Insight, Lesson } from "@wrud/shared";

export type LessonDraft = Omit<Lesson, "id" | "createdAt">;

export function lessonsFromInsights(
  insights: Insight[],
  sessionId: string,
): LessonDraft[] {
  const out: LessonDraft[] = [];
  for (const i of insights) {
    switch (i.type) {
      case "model_rightsizing": {
        const est = i.evidence.estCostUsd;
        const low = i.evidence.lowTierCostUsd;
        const fmt = (n: number) => (n < 0.01 ? n.toFixed(4) : n.toFixed(2));
        const dollars =
          typeof est === "number" && typeof low === "number"
            ? ` This run cost ~$${fmt(est)}; a low-tier model would have been ~$${fmt(low)}.`
            : "";
        out.push({
          sessionId,
          scope: "user",
          guidance: `For small/trivial tasks, prefer a lighter, cheaper model. ${String(
            i.evidence.model ?? "a high-tier model",
          )} was used for a change that produced little output.${dollars}`,
          source: "model_rightsizing",
        });
        break;
      }
      case "context_overhead": {
        const avg = i.evidence.avgInputPerCall;
        const pct = i.evidence.cachedInputPct;
        out.push({
          sessionId,
          scope: "user",
          guidance:
            `Input tokens dwarf output${
              typeof avg === "number"
                ? ` (~${avg.toLocaleString("en-US")} per call)`
                : ""
            } because the standing environment - system prompt, memory files, skill lists, ` +
            `MCP tool schemas, hooks - rides along on every model call. Disconnect unused MCP ` +
            `servers and plugins to shrink the baseline` +
            (typeof pct === "number" && pct > 0
              ? `; prompt cache covered ${pct}% of it, which softens cost but not context-window pressure.`
              : "."),
          source: "context_overhead",
        });
        break;
      }
      case "high_error_rate":
        out.push({
          sessionId,
          scope: "session",
          guidance: `This session hit ${String(
            i.evidence.errorCount ?? "several",
          )} errors - review the failures and add guardrails before retrying similar work.`,
          source: "high_error_rate",
        });
        break;
    }
  }
  return out;
}
