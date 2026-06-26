/**
 * cliNarrator - summarize a session by shelling out to a local agent CLI in headless mode,
 * using the user's existing login (no API key). The command is configurable via
 * WRUD_NARRATOR_CMD (default `claude`, which supports `-p` + `--output-format json`). Two
 * safeguards:
 *   - WRUD_IN_SUMMARY=1 is exported into the child so wrud's own hooks NO-OP for this nested
 *     invocation - otherwise SessionEnd -> narrator -> SessionEnd would loop forever.
 *   - a hard timeout; on any failure the caller keeps the deterministic narrative.
 * If the command isn't available (e.g. a host without that CLI), the caller falls back to the
 * deterministic summary, so this stays best-effort and provider-agnostic.
 */
import { execFile } from "node:child_process";

const TIMEOUT_MS = Number(process.env.WRUD_NARRATOR_TIMEOUT_MS || 90_000);
const CMD = process.env.WRUD_NARRATOR_CMD || "claude";
const MODEL = process.env.WRUD_NARRATOR_MODEL || "haiku"; // cheap is plenty for a 3-sentence recap

export interface NarratorInput {
  systemPrompt: string;
  userPrompt: string;
}

export function cliNarrator(input: NarratorInput): Promise<string> {
  const prompt = `${input.systemPrompt}\n\n${input.userPrompt}`;
  return new Promise((resolve, reject) => {
    const child = execFile(
      CMD,
      ["-p", prompt, "--model", MODEL, "--output-format", "json"],
      {
        timeout: TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, WRUD_IN_SUMMARY: "1" }, // recursion guard for the nested session
      },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          const parsed = JSON.parse(stdout);
          const text = (parsed.result ?? parsed.text ?? "").toString().trim();
          if (!text) return reject(new Error("empty narrator result"));
          resolve(text);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
    );
    child.on("error", reject); // e.g. the narrator CLI not on PATH
  });
}

/** Is wrud running INSIDE its own summarization sub-call? Hooks must no-op if so. */
export const isNestedSummaryRun = (): boolean =>
  process.env.WRUD_IN_SUMMARY === "1";
