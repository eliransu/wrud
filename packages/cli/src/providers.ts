/**
 * Provider registry - the ONE place agent-specific integration details live: where each agent's
 * hook config file is, how to write hooks into it, which lifecycle event routes to which wrud
 * hook (record/flush/finalize), and how to normalize that agent's hook payload into wrud's shape.
 * Everything else in wrud is provider-agnostic. Add an agent by adding an entry here plus a
 * providers/<id>.md doc - no other code changes.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type HookKind =
  | "session_start"
  | "user_prompt"
  | "tool_use"
  | "assistant_msg"
  | "session_end"
  | "ignore";

/** Provider-neutral view of a single hook invocation. */
export interface NormalizedHook {
  kind: HookKind;
  sessionId: string; // stable correlation id across one conversation's hooks
  cwd?: string;
  model?: string; // model name when the agent provides it on hooks (Cursor does)
  prompt?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  ok?: boolean;
  assistantText?: string;
  transcriptPath?: string;
}

export type HookSub = "record" | "flush" | "finalize";

export interface ProviderSpec {
  id: string;
  label: string;
  agentName: string; // recorded as session.agent.name
  settingsPath(scope: "user" | "project"): string;
  parseSettings?(raw: string): any;
  formatSettings?(settings: any): string;
  /** Merge wrud's hooks into the agent's settings object (returns it). cmdFor(sub) builds the
   * full shell command for a given wrud hook subcommand. Idempotent: prior wrud entries are
   * stripped first so re-running doesn't stack duplicates. */
  mergeHooks(settings: any, cmdFor: (sub: HookSub) => string): any;
  /** Inverse of mergeHooks: strip every wrud hook entry from the settings object, leaving the
   * user's own config untouched. Prunes event keys (and provider-only scaffolding like Cursor's
   * `version`) that become empty, so an install-created file ends up `{}` and the caller can
   * delete it. Returns true if anything was removed. */
  removeHooks(settings: any): boolean;
  /** Does this settings object already contain wrud hooks? (cross-scope dedupe warning) */
  hasWrudHooks(settings: any): boolean;
  /** Is this agent present on the machine? Drives `install-hooks` auto-detect (no --agent ->
   * wire every agent you actually have). A cheap config-dir check, not a deep probe. */
  isInstalled(): boolean;
  /** Map a raw hook payload (stdin JSON) to the normalized shape. */
  normalize(payload: any): NormalizedHook;
}

const isWrudCmd = (cmd: unknown): boolean =>
  typeof cmd === "string" && /\bhook\b/.test(cmd) && /wrud|cli\.mjs/.test(cmd);

/* ----------------------------------------------------------------------------- claude-code -- */
const claudeCode: ProviderSpec = {
  id: "claude-code",
  label: "Claude Code",
  agentName: "claude-code",
  settingsPath: (scope) =>
    scope === "project"
      ? join(process.cwd(), ".claude", "settings.json")
      : join(homedir(), ".claude", "settings.json"),
  mergeHooks(settings, cmdFor) {
    settings.hooks ??= {};
    const map: Record<string, HookSub> = {
      SessionStart: "record",
      UserPromptSubmit: "record",
      PostToolUse: "record",
      Stop: "flush",
      SessionEnd: "finalize",
    };
    for (const [event, sub] of Object.entries(map)) {
      const existing: any[] = Array.isArray(settings.hooks[event])
        ? settings.hooks[event]
        : [];
      const kept = existing
        .map((g: any) => ({
          ...g,
          hooks: (g.hooks || []).filter((h: any) => !isWrudCmd(h?.command)),
        }))
        .filter((g: any) => (g.hooks || []).length > 0);
      kept.push({ hooks: [{ type: "command", command: cmdFor(sub) }] });
      settings.hooks[event] = kept;
    }
    return settings;
  },
  removeHooks(settings) {
    if (!settings?.hooks || typeof settings.hooks !== "object") return false;
    let removed = false;
    for (const event of Object.keys(settings.hooks)) {
      const groups: any[] = Array.isArray(settings.hooks[event])
        ? settings.hooks[event]
        : [];
      const kept = groups
        .map((g: any) => ({
          ...g,
          hooks: (g.hooks || []).filter((h: any) => {
            const drop = isWrudCmd(h?.command);
            removed ||= drop;
            return !drop;
          }),
        }))
        .filter((g: any) => (g.hooks || []).length > 0);
      if (kept.length > 0) settings.hooks[event] = kept;
      else delete settings.hooks[event];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    return removed;
  },
  hasWrudHooks: (settings) =>
    Object.values(settings?.hooks || {}).some((groups: any) =>
      (Array.isArray(groups) ? groups : []).some((g: any) =>
        (g?.hooks || []).some((h: any) => isWrudCmd(h?.command)),
      ),
    ),
  isInstalled: () => existsSync(join(homedir(), ".claude")),
  normalize(p) {
    const sid = String(p.session_id ?? "");
    switch (p.hook_event_name) {
      case "SessionStart":
        return { kind: "session_start", sessionId: sid, cwd: p.cwd };
      case "UserPromptSubmit":
        return { kind: "user_prompt", sessionId: sid, prompt: p.prompt };
      case "PreToolUse":
      case "PostToolUse":
        return {
          kind: "tool_use",
          sessionId: sid,
          toolName: p.tool_name,
          toolInput: p.tool_input,
          toolOutput: p.tool_response,
          ok: p.tool_response ? p.tool_response.ok !== false : true,
        };
      case "Stop":
        return {
          kind: "assistant_msg",
          sessionId: sid,
          assistantText:
            typeof p.last_assistant_message === "string"
              ? p.last_assistant_message
              : undefined,
        };
      case "SessionEnd":
        return {
          kind: "session_end",
          sessionId: sid,
          cwd: p.cwd,
          transcriptPath: p.transcript_path,
        };
      default:
        return { kind: "ignore", sessionId: sid };
    }
  },
};

/* --------------------------------------------------------------------------------- cursor -- */
const cursor: ProviderSpec = {
  id: "cursor",
  label: "Cursor",
  agentName: "cursor",
  settingsPath: (scope) =>
    scope === "project"
      ? join(process.cwd(), ".cursor", "hooks.json")
      : join(homedir(), ".cursor", "hooks.json"),
  mergeHooks(settings, cmdFor) {
    settings.version ??= 1;
    settings.hooks ??= {};
    const map: Record<string, HookSub> = {
      sessionStart: "record",
      beforeSubmitPrompt: "record",
      afterFileEdit: "record",
      afterShellExecution: "record",
      afterAgentResponse: "flush",
      sessionEnd: "finalize",
    };
    for (const [event, sub] of Object.entries(map)) {
      const existing: any[] = Array.isArray(settings.hooks[event])
        ? settings.hooks[event]
        : [];
      const kept = existing.filter((h: any) => !isWrudCmd(h?.command));
      kept.push({ type: "command", command: cmdFor(sub) });
      settings.hooks[event] = kept;
    }
    return settings;
  },
  removeHooks(settings) {
    if (!settings?.hooks || typeof settings.hooks !== "object") return false;
    let removed = false;
    for (const event of Object.keys(settings.hooks)) {
      const arr: any[] = Array.isArray(settings.hooks[event])
        ? settings.hooks[event]
        : [];
      const kept = arr.filter((h: any) => {
        const drop = isWrudCmd(h?.command);
        removed ||= drop;
        return !drop;
      });
      if (kept.length > 0) settings.hooks[event] = kept;
      else delete settings.hooks[event];
    }
    if (Object.keys(settings.hooks).length === 0) {
      // `version` is scaffolding for the hooks schema - meaningless without hooks.
      delete settings.hooks;
      delete settings.version;
    }
    return removed;
  },
  hasWrudHooks: (settings) =>
    Object.values(settings?.hooks || {}).some((arr: any) =>
      (Array.isArray(arr) ? arr : []).some((h: any) => isWrudCmd(h?.command)),
    ),
  isInstalled: () => existsSync(join(homedir(), ".cursor")),
  normalize(p) {
    const sid = String(p.conversation_id ?? p.session_id ?? "");
    const model = p.model ?? p.model_id;
    switch (p.hook_event_name) {
      case "sessionStart":
        return {
          kind: "session_start",
          sessionId: sid,
          cwd: (p.workspace_roots && p.workspace_roots[0]) || p.cwd,
          model,
        };
      case "beforeSubmitPrompt":
        return { kind: "user_prompt", sessionId: sid, prompt: p.prompt, model };
      case "afterFileEdit":
        return {
          kind: "tool_use",
          sessionId: sid,
          toolName: "Edit",
          toolInput: { file_path: p.file_path, edits: p.edits },
          ok: true,
          model,
        };
      case "beforeShellExecution":
      case "afterShellExecution":
        return {
          kind: "tool_use",
          sessionId: sid,
          toolName: "Shell",
          toolInput: { command: p.command, cwd: p.cwd },
          toolOutput: p.output,
          ok: true,
          model,
        };
      case "afterAgentResponse":
        return {
          kind: "assistant_msg",
          sessionId: sid,
          assistantText: typeof p.text === "string" ? p.text : undefined,
          model,
        };
      case "sessionEnd":
        return {
          kind: "session_end",
          sessionId: sid,
          transcriptPath: p.transcript_path,
          model,
        };
      default:
        return { kind: "ignore", sessionId: sid };
    }
  },
};

/* ---------------------------------------------------------------------------------- codex -- */
const codex: ProviderSpec = {
  id: "codex",
  label: "OpenAI Codex CLI",
  agentName: "codex",
  settingsPath: (scope) =>
    scope === "project"
      ? join(process.cwd(), ".codex", "config.toml")
      : join(homedir(), ".codex", "config.toml"),
  parseSettings: (raw) => ({ raw }),
  formatSettings: (settings) =>
    `${String(settings.raw ?? "").replace(/\s*$/u, "")}\n`,
  mergeHooks(settings, cmdFor) {
    const lines = String(settings.raw ?? "").split(/\r?\n/u);
    const kept = lines.filter(
      (line) => !/notify\s*=.*(?:wrud|cli\.mjs)/.test(line),
    );
    const command = cmdFor("flush").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    kept.push(`notify = ["sh", "-lc", "${command}"]`);
    settings.raw = kept
      .filter((line, index, arr) => line.trim() || index < arr.length - 1)
      .join("\n");
    return settings;
  },
  removeHooks(settings) {
    const before = String(settings.raw ?? "");
    const after = before
      .split(/\r?\n/u)
      .filter((line) => !/notify\s*=.*(?:wrud|cli\.mjs)/.test(line))
      .join("\n");
    settings.raw = after;
    return after !== before;
  },
  hasWrudHooks: (settings) =>
    /notify\s*=.*(?:wrud|cli\.mjs)/.test(String(settings?.raw ?? "")),
  isInstalled: () => existsSync(join(homedir(), ".codex")),
  normalize(p) {
    const sid = String(
      p.session_id ?? p.conversation_id ?? p.thread_id ?? "codex",
    );
    if (p.type === "agent-turn-complete" || p.type === "turn-complete") {
      return {
        kind: "assistant_msg",
        sessionId: sid,
        cwd: p.cwd,
        model: p.model,
        assistantText:
          typeof p.last_assistant_message === "string"
            ? p.last_assistant_message
            : undefined,
      };
    }
    return { kind: "ignore", sessionId: sid };
  },
};

const REGISTRY: Record<string, ProviderSpec> = {
  "claude-code": claudeCode,
  codex,
  cursor,
};

export const providerIds = Object.keys(REGISTRY);
export const defaultProviderId = claudeCode.id;

/** Look up a provider by id; defaults to the default provider (back-compat for hooks installed without --provider). */
export function getProvider(id: string | undefined): ProviderSpec {
  return (id && REGISTRY[id]) || claudeCode;
}

/** Ids of agents actually present on this machine - what `install-hooks` wires when no --agent is given. */
export function installedProviderIds(): string[] {
  return providerIds.filter((id) => getProvider(id).isInstalled());
}
