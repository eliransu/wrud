/**
 * @wrud/sdk/claude-code - translate Claude Code lifecycle hook payloads into wrud's flat
 * event shape (WrudEventInput, so the output feeds straight into SessionHandle.event()).
 *
 * Wiring (documented in the README): a tiny hook script reads the hook JSON on stdin,
 * calls hookPayloadToEvents(), and feeds them to a SessionHandle whose session id is
 * persisted in a per-session temp file ($TMPDIR/wrud-<sessionId>.json) so hooks across one
 * Claude Code session correlate without colliding with concurrent sessions.
 *
 * Phase 1 ships the pure mapping (unit-tested here). Hook payload field names are read
 * defensively since they may vary by Claude Code version.
 */
import type { WrudEventInput } from "./client.js";

export function hookPayloadToEvents(
  payload: Record<string, any>,
): WrudEventInput[] {
  switch (payload.hook_event_name) {
    case "PreToolUse":
    case "PostToolUse": {
      const ok = payload.tool_response
        ? payload.tool_response.ok !== false
        : true;
      return [
        {
          type: "tool_call",
          name: String(payload.tool_name ?? "unknown"),
          ok,
          ...(payload.duration_ms != null
            ? { durationMs: Number(payload.duration_ms) }
            : {}),
        },
      ];
    }
    case "Stop":
    case "SessionStart":
    case "SessionEnd":
      return []; // session lifecycle handled by the hook script (start/summarize), not as events
    default:
      return [];
  }
}
