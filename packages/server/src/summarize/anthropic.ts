/**
 * anthropicNarrator - optional LLM narrator. Calls the Anthropic Messages API via fetch (no
 * SDK dep) using the SHARED SUMMARY_SYSTEM_PROMPT + buildSummaryUserPrompt, so the narrative
 * is identical whether the server or the client produces it. Best-effort: any failure -> the
 * composite falls back to narrative: null.
 */
import { SUMMARY_SYSTEM_PROMPT, buildSummaryUserPrompt } from "@wrud/shared";
import type { Narrator } from "./composite.js";

export function anthropicNarrator(
  apiKey: string,
  model = "claude-haiku-4-5-20251001",
): Narrator {
  return async ({ summary, events }) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildSummaryUserPrompt(
              summary.stats,
              summary.insights,
              events,
            ),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? "";
  };
}
