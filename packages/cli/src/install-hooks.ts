/**
 * `wrud install-hooks [--agent <id>] [--user|--project]` - the installer.
 *   - no --agent   -> AUTO-DETECT every agent present on the machine and wire all of them,
 *   - --agent <id> -> wire just that one.
 * For each target it mints a shared least-privilege ingest key, merges wrud's hooks into the
 * agent's config (the provider registry owns path/format/event routing) idempotently, warns on
 * the double-capture footgun, and finally self-verifies once with `wrud doctor`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { INGEST_TOKEN_FILE, ensureHome, ensureToken } from "./env.js";
import {
  getProvider,
  installedProviderIds,
  providerIds,
  defaultProviderId,
  type HookSub,
  type ProviderSpec,
} from "./providers.js";
import { runDoctor } from "./doctor.js";

/** Wire one provider's hooks at the given scope (idempotent). */
function wireProvider(
  provider: ProviderSpec,
  scope: "user" | "project",
  cliPath: string,
): void {
  const settingsPath = provider.settingsPath(scope);
  const otherPath = provider.settingsPath(
    scope === "project" ? "user" : "project",
  );
  console.log(`\n  ${provider.label} @ ${scope}`);
  console.log(`    settings: ${settingsPath}`);

  const settings: any = existsSync(settingsPath)
    ? JSON.parse(readFileSync(settingsPath, "utf8") || "{}")
    : {};
  const cmdFor = (sub: HookSub) =>
    `"${process.execPath}" "${cliPath}" hook ${sub} --provider ${provider.id}`;
  provider.mergeHooks(settings, cmdFor);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(
    "    wired: start/prompt/tool -> record, reply -> flush, end -> finalize",
  );

  // double-capture warning: same agent's wrud hooks in the OTHER scope (only when it's a
  // genuinely different file - running from $HOME makes user==project path, which is not a clash).
  if (otherPath !== settingsPath && existsSync(otherPath)) {
    try {
      const other = JSON.parse(readFileSync(otherPath, "utf8") || "{}");
      if (provider.hasWrudHooks(other))
        console.log(
          `    WARNING: wrud hooks also exist in ${otherPath} - both fire and double-capture. Remove one scope.`,
        );
    } catch {
      /* ignore unreadable other settings */
    }
  }
}

export async function runInstallHooks(
  args: string[],
  cliPath: string,
): Promise<number> {
  const scope: "user" | "project" = args.includes("--project")
    ? "project"
    : "user";

  // Resolve targets: explicit --agent wins; otherwise auto-detect installed agents.
  let targetIds: string[];
  if (args.includes("--agent")) {
    const agentArg = args[args.indexOf("--agent") + 1];
    if (!agentArg || !providerIds.includes(agentArg)) {
      console.error(
        `Unknown agent '${agentArg ?? ""}'. Supported: ${providerIds.join(", ")}.`,
      );
      return 1;
    }
    targetIds = [agentArg];
  } else {
    targetIds = installedProviderIds();
    if (targetIds.length === 0) {
      console.log(
        `No supported agent detected. Defaulting to ${defaultProviderId}.`,
      );
      console.log(
        `  (force one with: install-hooks --agent <${providerIds.join("|")}>)`,
      );
      targetIds = [defaultProviderId];
    } else {
      console.log(
        `wrud install-hooks -> detected ${targetIds
          .map((id) => getProvider(id).label)
          .join(" + ")} - wiring ${targetIds.length === 1 ? "it" : "all"}.`,
      );
    }
  }

  // one shared least-privilege ingest key for all the hooks
  ensureHome();
  await ensureToken(INGEST_TOKEN_FILE, "wrud-hooks-ingest", ["ingest"]);
  console.log(`  ingest key: stored 0600 at ${INGEST_TOKEN_FILE}`);

  for (const id of targetIds) wireProvider(getProvider(id), scope, cliPath);

  // self-verify once (needs the server running)
  console.log("\n  verifying...\n");
  const code = await runDoctor();
  console.log(
    code === 0
      ? "\nDone. Hooks installed and verified - your sessions will record automatically.\n"
      : "\nHooks installed, but verification didn't pass. Start the server (`npx @wrud/cli`) and re-run `wrud doctor`.\n",
  );
  return code;
}
