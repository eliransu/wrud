import { describe, it, expect } from "vitest";
import { hookPayloadToEvents } from "./claude-code.js";

describe("claude-code hook adapter", () => {
  it("maps PreToolUse/PostToolUse to a tool_call event", () => {
    const evs = hookPayloadToEvents({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_response: { ok: true },
      duration_ms: 42,
    });
    expect(evs).toEqual([
      { type: "tool_call", name: "Edit", ok: true, durationMs: 42 },
    ]);
  });
  it("maps a Stop hook to no events (summarize is triggered separately)", () => {
    expect(hookPayloadToEvents({ hook_event_name: "Stop" })).toEqual([]);
  });
  it("ignores unknown hook events", () => {
    expect(hookPayloadToEvents({ hook_event_name: "Whatever" })).toEqual([]);
  });
});
