/**
 * Client-side narrators for `summarize({ mode: "client", narrator })`. The Anthropic one
 * calls the Messages API via fetch using the SHARED system + user prompts the SDK passes in,
 * so a client-produced narrative matches a server-produced one. Bring your own key.
 */
import type { WrudNarrator } from "./client.js";

export function anthropicNarrator(
  apiKey: string,
  model = "claude-haiku-4-5-20251001",
): WrudNarrator {
  return async ({ systemPrompt, userPrompt }) => {
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
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? "";
  };
}
