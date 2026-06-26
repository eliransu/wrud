/**
 * `wrud install-hooks [--agent <id>] [--user|--project]` - the real installer. It:
 *   1. mints a dedicated LEAST-PRIVILEGE ingest key (not the admin/dashboard token), stored 0600,
 *   2. merges wrud's hooks into the chosen agent's config file (provider registry knows the path,
 *      format, and event routing) - user level (all projects) or project level - idempotently,
 *   3. warns about the double-capture footgun if wrud hooks already exist in the OTHER scope,
 *   4. self-verifies with `wrud doctor`.
 * No /abs/path placeholders, no "figure out the token yourself".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { INGEST_TOKEN_FILE, ensureHome, ensureToken } from "./env.js";
import {
  getProvider,
  providerIds,
  defaultProviderId,
  type HookSub,
} from "./providers.js";
import { runDoctor } from "./doctor.js";

export async function runInstallHooks(
  args: string[],
  cliPath: string,
): Promise<number> {
  const scope: "user" | "project" = args.includes("--project")
    ? "project"
    : "user";
  const agentArg = args[args.indexOf("--agent") + 1];
  const agentId =
    args.includes("--agent") && agentArg ? agentArg : defaultProviderId;
  if (!providerIds.includes(agentId)) {
    console.error(
      `Unknown agent '${agentId}'. Supported: ${providerIds.join(", ")}.`,
    );
    return 1;
  }
  const provider = getProvider(agentId);
  const settingsPath = provider.settingsPath(scope);
  const otherPath = provider.settingsPath(
    scope === "project" ? "user" : "project",
  );

  console.log(`wrud install-hooks -> ${provider.label} @ ${scope} level`);
  console.log(`  settings: ${settingsPath}`);

  // 1) mint / reuse a dedicated ingest-only key
  ensureHome();
  await ensureToken(INGEST_TOKEN_FILE, "wrud-hooks-ingest", ["ingest"]);
  console.log(`  ingest key: stored 0600 at ${INGEST_TOKEN_FILE}`);

  // 2) merge wrud's hooks into the agent's config (idempotent; format owned by the provider)
  const settings: any = existsSync(settingsPath)
    ? JSON.parse(readFileSync(settingsPath, "utf8") || "{}")
    : {};
  const cmdFor = (sub: HookSub) =>
    `"${process.execPath}" "${cliPath}" hook ${sub} --provider ${provider.id}`;
  provider.mergeHooks(settings, cmdFor);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(
    "  wired: session start/prompt/tool -> record, agent reply -> flush, session end -> finalize",
  );

  // 3) double-capture warning (wrud hooks for this agent in the other scope)
  if (existsSync(otherPath)) {
    try {
      const other = JSON.parse(readFileSync(otherPath, "utf8") || "{}");
      if (provider.hasWrudHooks(other))
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
