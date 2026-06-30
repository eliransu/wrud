/**
 * removeHooks is the destructive inverse of mergeHooks (it powers `wrud cleanup`), so it gets the
 * scrutiny: it must strip ONLY wrud's hooks, never the user's own config, and an install-created
 * file must round-trip back to empty so cleanup can delete it.
 */
import { describe, expect, it } from "vitest";
import { getProvider, type HookSub } from "./providers.js";

const cmdFor = (sub: HookSub) =>
  `"/usr/bin/node" "/x/dist/cli.mjs" hook ${sub} --provider test`;

describe("claude-code removeHooks", () => {
  const p = getProvider("claude-code");

  it("round-trips an install-created file back to empty", () => {
    const s: any = {};
    p.mergeHooks(s, cmdFor);
    expect(p.hasWrudHooks(s)).toBe(true);
    expect(p.removeHooks(s)).toBe(true);
    expect(p.hasWrudHooks(s)).toBe(false);
    expect(Object.keys(s)).toHaveLength(0); // cleanup will delete the file
  });

  it("preserves the user's own hooks and settings", () => {
    const s: any = {
      model: "opus",
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "my-own-script.sh" }] },
        ],
      },
    };
    p.mergeHooks(s, cmdFor);
    expect(p.removeHooks(s)).toBe(true);
    expect(s.model).toBe("opus");
    expect(s.hooks.SessionStart).toEqual([
      { hooks: [{ type: "command", command: "my-own-script.sh" }] },
    ]);
    expect(p.hasWrudHooks(s)).toBe(false);
  });

  it("is a no-op when there are no wrud hooks", () => {
    const s: any = { hooks: { Stop: [{ hooks: [{ command: "x" }] }] } };
    expect(p.removeHooks(s)).toBe(false);
  });
});

describe("codex hooks", () => {
  const p = getProvider("codex");

  it("round-trips a TOML config and preserves user settings", () => {
    const s: any = p.parseSettings?.('model = "gpt-5"\n');
    p.mergeHooks(s, cmdFor);
    expect(p.hasWrudHooks(s)).toBe(true);
    expect(s.raw).toContain('model = "gpt-5"');
    expect(s.raw).toContain('notify = ["sh", "-lc",');
    expect(p.removeHooks(s)).toBe(true);
    expect(p.hasWrudHooks(s)).toBe(false);
    expect(s.raw.trim()).toBe('model = "gpt-5"');
  });

  it("normalizes Codex notification payloads as assistant messages", () => {
    expect(
      p.normalize({
        type: "agent-turn-complete",
        session_id: "abc",
        cwd: "/repo",
        model: "gpt-5",
        last_assistant_message: "done",
      }),
    ).toEqual({
      kind: "assistant_msg",
      sessionId: "abc",
      cwd: "/repo",
      model: "gpt-5",
      assistantText: "done",
    });
  });
});

describe("cursor removeHooks", () => {
  const p = getProvider("cursor");

  it("round-trips an install-created file back to empty (version pruned)", () => {
    const s: any = {};
    p.mergeHooks(s, cmdFor);
    expect(s.version).toBe(1);
    expect(p.removeHooks(s)).toBe(true);
    expect(Object.keys(s)).toHaveLength(0);
  });

  it("keeps version when the user has other hooks", () => {
    const s: any = {
      version: 1,
      hooks: {
        beforeSubmitPrompt: [{ type: "command", command: "lint.sh" }],
      },
    };
    p.mergeHooks(s, cmdFor);
    expect(p.removeHooks(s)).toBe(true);
    expect(s.version).toBe(1);
    expect(s.hooks.beforeSubmitPrompt).toEqual([
      { type: "command", command: "lint.sh" },
    ]);
    expect(p.hasWrudHooks(s)).toBe(false);
  });
});
