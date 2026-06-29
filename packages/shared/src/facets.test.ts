import { describe, it, expect } from "vitest";
import { sessionFacets, eventFacets, eventTokens } from "./facets.js";
import type { Session, Event } from "./index.js";

const session: Session = {
  id: "s1",
  apiKeyId: "k1",
  user: { id: "u1", email: "u@x.io" },
  agent: { name: "claude-code", version: "1" },
  runtime: {},
  metadata: {},
  status: "open",
  startedAt: "2026-06-25T10:00:00.000Z",
  endedAt: null,
  createdAt: "2026-06-25T10:00:00.000Z",
};

const ev = (type: Event["type"], payload: unknown): Event =>
  ({
    id: "e",
    sessionId: "s1",
    seq: 0,
    timestamp: "2026-06-25T10:00:00.000Z",
    type,
    payload,
  }) as Event;

describe("facet extraction", () => {
  it("derives user + agent from the session", () => {
    expect(sessionFacets(session)).toEqual([
      { dim: "user", value: "u1" },
      { dim: "agent", value: "claude-code" },
    ]);
  });

  it("classifies tool_call into tool / mcp / skill", () => {
    expect(eventFacets(ev("tool_call", { name: "Edit", ok: true }))).toEqual([
      { dim: "tool", value: "Edit" },
    ]);
    expect(
      eventFacets(ev("tool_call", { name: "mcp__slack__send", ok: true })),
    ).toEqual([{ dim: "mcp", value: "mcp__slack__send" }]);
    // Skill tool: input may be a JSON string or an object
    expect(
      eventFacets(
        ev("tool_call", {
          name: "Skill",
          ok: true,
          input: '{"skill":"frontend-design"}',
        }),
      ),
    ).toEqual([{ dim: "skill", value: "frontend-design" }]);
    expect(
      eventFacets(
        ev("tool_call", {
          name: "Skill",
          ok: true,
          input: { skill: "brainstorming" },
        }),
      ),
    ).toEqual([{ dim: "skill", value: "brainstorming" }]);
  });

  it("extracts /commands from user messages, normalized lower-case", () => {
    expect(
      eventFacets(
        ev("message", { role: "user", chars: 8, text: "/Review please" }),
      ),
    ).toEqual([{ dim: "command", value: "/review" }]);
    // assistant messages and plain text contribute nothing
    expect(
      eventFacets(ev("message", { role: "assistant", chars: 3, text: "/x" })),
    ).toEqual([]);
    expect(
      eventFacets(ev("message", { role: "user", chars: 2, text: "hi" })),
    ).toEqual([]);
  });

  it("extracts file extension and error kind", () => {
    expect(
      eventFacets(
        ev("file_change", { path: "/a/b/Component.TSX", op: "edit" }),
      ),
    ).toEqual([{ dim: "file_ext", value: "tsx" }]);
    expect(
      eventFacets(ev("file_change", { path: "/a/Makefile", op: "create" })),
    ).toEqual([]); // extensionless
    expect(
      eventFacets(ev("error", { message: "boom", kind: "timeout" })),
    ).toEqual([{ dim: "error_kind", value: "timeout" }]);
    expect(eventFacets(ev("error", { message: "boom" }))).toEqual([
      { dim: "error_kind", value: "error" },
    ]);
  });

  it("sums tokens only from model_use", () => {
    expect(
      eventTokens(
        ev("model_use", { model: "m", inputTokens: 5, outputTokens: 9 }),
      ),
    ).toEqual({ input: 5, output: 9 });
    expect(eventTokens(ev("tool_call", { name: "Edit", ok: true }))).toEqual({
      input: 0,
      output: 0,
    });
  });
});
