/**
 * `wrud install-hooks [--user|--project] [--agent claude-code]` - the real installer. It:
 *   1. mints a dedicated LEAST-PRIVILEGE ingest key (not the admin/dashboard token) and stores
 *      it 0600 at ~/.wrud/ingest-token,
 *   2. merges wrud's hook commands into the right settings.json (user = all projects; project =
 *      this repo only), idempotently and without clobbering existing hooks,
 *   3. warns about the double-capture footgun if wrud hooks already exist in the OTHER scope,
 *   4. self-verifies with `wrud doctor`.
 * No /abs/path placeholders, no "figure out the token yourself".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { INGEST_TOKEN_FILE, ensureHome, ensureToken } from "./env.js";
import { runDoctor } from "./doctor.js";

const EVENT_SUB: Record<string, string> = {
  SessionStart: "record",
  UserPromptSubmit: "record",
  PostToolUse: "record",
  Stop: "flush",
  SessionEnd: "finalize",
};

const isWrudCmd = (cmd: unknown): boolean =>
  typeof cmd === "string" && /\bhook\b/.test(cmd) && /wrud|cli\.mjs/.test(cmd);

export async function runInstallHooks(
  args: string[],
  cliPath: string,
): Promise<number> {
  const scope = args.includes("--project") ? "project" : "user"; // default: user (all projects)
  const agent = "claude-code"; // only supported host today; flag reserved for future

  const userSettings = join(homedir(), ".claude", "settings.json");
  const projectSettings = join(process.cwd(), ".claude", "settings.json");
  const settingsPath = scope === "project" ? projectSettings : userSettings;
  const otherPath = scope === "project" ? userSettings : projectSettings;

  console.log(`wrud install-hooks -> ${agent} @ ${scope} level`);
  console.log(`  settings: ${settingsPath}`);

  // 1) mint / reuse a dedicated ingest-only key
  ensureHome();
  await ensureToken(INGEST_TOKEN_FILE, "wrud-hooks-ingest", ["ingest"]);
  console.log(`  ingest key: stored 0600 at ${INGEST_TOKEN_FILE}`);

  // 2) merge into settings.json (idempotent: drop any prior wrud hook entries first)
  const settings: any = existsSync(settingsPath)
    ? JSON.parse(readFileSync(settingsPath, "utf8") || "{}")
    : {};
  settings.hooks ??= {};
  const command = `"${process.execPath}" "${cliPath}" hook`; // + " <sub>"

  for (const [event, sub] of Object.entries(EVENT_SUB)) {
    const existing: any[] = Array.isArray(settings.hooks[event])
      ? settings.hooks[event]
      : [];
    // strip our previous entries so re-running doesn't stack duplicates
    const kept = existing
      .map((group: any) => ({
        ...group,
        hooks: (group.hooks || []).filter((h: any) => !isWrudCmd(h?.command)),
      }))
      .filter((group: any) => (group.hooks || []).length > 0);
    kept.push({ hooks: [{ type: "command", command: `${command} ${sub}` }] });
    settings.hooks[event] = kept;
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(
    `  wired: SessionStart/UserPromptSubmit/PostToolUse->record, Stop->flush, SessionEnd->finalize`,
  );

  // 3) double-capture warning
  if (existsSync(otherPath)) {
    try {
      const other = JSON.parse(readFileSync(otherPath, "utf8") || "{}");
      const hasWrud = Object.values(other.hooks || {}).some((groups: any) =>
        (Array.isArray(groups) ? groups : []).some((g: any) =>
          (g.hooks || []).some((h: any) => isWrudCmd(h?.command)),
        ),
      );
      if (hasWrud)
        console.log(
          `\n  WARNING: wrud hooks also exist in ${otherPath}. Both will fire and DOUBLE-capture\n    sessions in overlapping directories. Remove one scope (runtime dedupe collapses\n    identical events, but removing the duplicate is cleaner).`,
        );
    } catch {
      /* ignore unreadable other settings */
    }
  }

  // 4) self-verify (needs the server running)
  console.log("\n  verifying...\n");
  const code = await runDoctor();
  console.log(
    code === 0
      ? "Done. Hooks installed and verified - your sessions will record automatically.\n"
      : "Hooks installed, but verification didn't pass. Start the server (`npx @wrud/cli`) and re-run `wrud doctor`.\n",
  );
  return code;
}
