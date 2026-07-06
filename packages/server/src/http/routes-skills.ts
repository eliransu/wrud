/**
 * Skill/command introspection + replay (local-first: the server runs on the same machine
 * as the agent, so it can read the skill files and re-invoke them).
 *   GET  /v1/skills/:name      - resolve the skill/command source file (scope: read)
 *   POST /v1/skills/:name/run  - execute it via `claude -p "/<name> <args>"` (scope: admin)
 * ponytail: Node-only (fs/child_process) like the sqlite adapter; inject a SkillSource
 * seam only if a non-Node runtime ever materializes.
 */
import { Hono } from "hono";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppEnv } from "../app.js";
import { requireScope } from "./auth-middleware.js";
import { AppError } from "./errors.js";

/** Letters/digits/colon/underscore/dash only - no dots or slashes, so no path traversal. */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9:_-]*$/i;

export interface ResolvedSkill {
  name: string;
  kind: "skill" | "command";
  path: string;
  content: string;
}

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** Case-insensitive entry lookup (slash commands are lowercased at capture time). */
function findEntry(dir: string, want: string): string | null {
  try {
    const lower = want.toLowerCase();
    return readdirSync(dir).find((e) => e.toLowerCase() === lower) ?? null;
  } catch {
    return null;
  }
}

/** Look for `skills/<name>/SKILL.md` or `commands/<name>.md` under one `.claude`-style dir. */
function tryResolveAt(base: string, name: string): ResolvedSkill | null {
  const skillsDir = join(base, "skills");
  const sd = findEntry(skillsDir, name);
  if (sd) {
    try {
      const path = join(skillsDir, sd, "SKILL.md");
      return { name, kind: "skill", path, content: readFileSync(path, "utf8") };
    } catch {
      /* dir without SKILL.md - keep looking */
    }
  }
  const cmdsDir = join(base, "commands");
  const cf = findEntry(cmdsDir, `${name}.md`);
  if (cf) {
    try {
      const path = join(cmdsDir, cf);
      return {
        name,
        kind: "command",
        path,
        content: readFileSync(path, "utf8"),
      };
    } catch {
      /* unreadable - keep looking */
    }
  }
  return null;
}

/**
 * Resolve a captured skill/command name (`review`, `/review`, `plugin:skill`) to its
 * source file. Search order: the given `.claude` dirs (user, then project), then the
 * plugin cache (`<home>/plugins/cache/<marketplace>/<plugin>/<version>/{skills,commands}`).
 */
export function resolveSkill(
  rawName: string,
  claudeDirs: string[],
): ResolvedSkill | null {
  const name = rawName.replace(/^\//, "");
  if (!SKILL_NAME_RE.test(name)) return null;
  const colon = name.indexOf(":");
  const plugin = colon > 0 ? name.slice(0, colon) : null;
  const bare = colon > 0 ? name.slice(colon + 1) : name;

  for (const base of claudeDirs) {
    const hit =
      tryResolveAt(base, name) ?? (plugin ? tryResolveAt(base, bare) : null);
    if (hit) return { ...hit, name };
  }
  const cache = join(claudeDirs[0] ?? "", "plugins", "cache");
  for (const marketplace of listDirs(cache)) {
    for (const plug of listDirs(join(cache, marketplace))) {
      if (plugin && plug.toLowerCase() !== plugin.toLowerCase()) continue;
      // newest version first (lexicographic is close enough for a lookup)
      for (const version of listDirs(join(cache, marketplace, plug))
        .sort()
        .reverse()) {
        const hit = tryResolveAt(join(cache, marketplace, plug, version), bare);
        if (hit) return { ...hit, name };
      }
    }
  }
  return null;
}

const RUN_TIMEOUT_MS = 5 * 60_000;
const MAX_OUTPUT_BYTES = 1_000_000;

/** Run `claude -p <prompt>` (no shell - the prompt is a single argv entry). */
function runClaude(
  prompt: string,
): Promise<{ ok: boolean; exitCode: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", prompt], {
      cwd: homedir(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const cap = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_BYTES) output += chunk.toString();
    };
    child.stdout.on("data", cap);
    child.stderr.on("data", cap);
    const timer = setTimeout(() => {
      output += "\n[wrud] timed out after 5 minutes - killed";
      child.kill("SIGKILL");
    }, RUN_TIMEOUT_MS);
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        output:
          err.code === "ENOENT"
            ? "claude CLI not found on PATH. Start wrud from a shell where `claude` works."
            : String(err),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, exitCode: code, output });
    });
  });
}

export const skillRoutes = new Hono<AppEnv>();

skillRoutes.get("/skills/:name", requireScope("read"), (c) => {
  const resolved = resolveSkill(c.req.param("name"), [
    join(homedir(), ".claude"),
    join(process.cwd(), ".claude"),
  ]);
  if (!resolved)
    throw new AppError(
      404,
      "not_found",
      "no local skill or command file found for this name",
    );
  return c.json(resolved, 200);
});

skillRoutes.post("/skills/:name/run", requireScope("admin"), async (c) => {
  const name = c.req.param("name").replace(/^\//, "");
  if (!SKILL_NAME_RE.test(name))
    throw new AppError(400, "invalid_request", "invalid skill name");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const args =
    typeof body.args === "string" ? body.args.trim().slice(0, 2000) : "";
  const result = await runClaude(`/${name}${args ? " " + args : ""}`);
  return c.json(result, 200);
});
