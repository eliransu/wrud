/**
 * Extract "skills & commands used" from a session's events - model/agent-agnostic.
 * Skills/commands surface through two paths (see the capture notes), both handled here:
 *   - model-invoked: a `Skill` tool call (skill name in input) or an `mcp__*` tool (an extension)
 *   - user-invoked: a message that starts with a slash command (`/go-to-market`, `/review`, ...)
 * No Claude-specific assumptions - slash commands + Skill/MCP tools are cross-agent patterns.
 */
export interface SkillUsage {
  skills: string[]; // explicit skills (Skill tool or /slash-command)
  extensions: string[]; // MCP / external tools (mcp__server__tool)
}

export function extractSkills(events: any[] | undefined): SkillUsage {
  const skills = new Set<string>();
  const extensions = new Set<string>();
  for (const e of events ?? []) {
    if (e.type === "tool_call") {
      const name: string = e.payload?.name ?? "";
      if (name === "Skill") {
        let s = "";
        try {
          s = JSON.parse(e.payload?.input ?? "{}").skill ?? "";
        } catch {
          /* input may not be JSON */
        }
        if (s) skills.add(s);
      } else if (name.startsWith("mcp__")) {
        extensions.add(name);
      }
    } else if (e.type === "message" && e.payload?.role === "user") {
      const m = /^\s*\/([a-zA-Z0-9:_-]+)/.exec(String(e.payload?.text ?? ""));
      if (m) skills.add("/" + m[1].toLowerCase()); // normalize so /Review and /review dedup
    }
  }
  return { skills: [...skills], extensions: [...extensions] };
}
