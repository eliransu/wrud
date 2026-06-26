import { describe, it, expect } from "vitest";
import { eventSchema, sessionSchema, apiKeyScopes } from "./schemas.js";

describe("eventSchema", () => {
  it("accepts a valid tool_call event", () => {
    const r = eventSchema.safeParse({
      id: "e1",
      sessionId: "s1",
      seq: 0,
      timestamp: "2026-06-25T10:00:00.000Z",
      type: "tool_call",
      payload: { name: "Edit", ok: true, durationMs: 12 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const r = eventSchema.safeParse({
      id: "e1",
      sessionId: "s1",
      seq: 0,
      timestamp: "2026-06-25T10:00:00.000Z",
      type: "nope",
      payload: {},
    });
    expect(r.success).toBe(false);
  });

  it("rejects a model_use event missing model", () => {
    const r = eventSchema.safeParse({
      id: "e1",
      sessionId: "s1",
      seq: 1,
      timestamp: "2026-06-25T10:00:00.000Z",
      type: "model_use",
      payload: { outputTokens: 10 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a known type with a malformed payload (tool_call without name/ok)", () => {
    const r = eventSchema.safeParse({
      id: "e1",
      sessionId: "s1",
      seq: 2,
      timestamp: "2026-06-25T10:00:00.000Z",
      type: "tool_call",
      payload: {},
    });
    expect(r.success).toBe(false);
  });
});

describe("sessionSchema", () => {
  it("requires user.id and agent.name", () => {
    const ok = sessionSchema.safeParse({
      id: "s1",
      apiKeyId: "k1",
      user: { id: "u1" },
      agent: { name: "claude-code" },
      runtime: {},
      metadata: {},
      status: "open",
      startedAt: "2026-06-25T10:00:00.000Z",
      endedAt: null,
      createdAt: "2026-06-25T10:00:00.000Z",
    });
    expect(ok.success).toBe(true);
    const bad = sessionSchema.safeParse({ id: "s1" });
    expect(bad.success).toBe(false);
  });
});

describe("apiKeyScopes", () => {
  it("contains the three scopes", () => {
    expect(apiKeyScopes).toEqual(["ingest", "read", "admin"]);
  });
});
