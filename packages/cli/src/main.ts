/**
 * `wrud` CLI - command router. Subcommands:
 *   wrud                      run the server + dashboard (default; attaches if already running)
 *   wrud doctor               end-to-end self-test of the capture path (PASS/FAIL + HTTP status)
 *   wrud install-hooks [--agent <id>] [--user|--project]   wire an agent's hooks + mint a key + verify
 *   wrud hook <record|flush|finalize|finalize-worker> [--provider <id>]   handlers (used by the agent)
 *
 * Bundled to dist/cli.mjs by build.mjs; the dashboard is at dist/web.
 */
import { fileURLToPath } from "node:url";
import { runServer } from "./server.js";
import { runDoctor } from "./doctor.js";
import { runInstallHooks } from "./install-hooks.js";
import { runHook } from "./hooks.js";
import { runCleanup } from "./cleanup.js";
import { runMenubar } from "./menubar.js";
import { runStop } from "./stop.js";
import { providerIds } from "./providers.js";

const CLI_PATH = fileURLToPath(import.meta.url); // dist/cli.mjs after bundling

const USAGE = `wrud - local-first recorder for AI-agent sessions

Usage:
  wrud [-d] [--no-install-hooks] [--no-menubar]
                                    start the server + dashboard (one origin); auto-wires
                                    your installed agents unless --no-install-hooks; on macOS
                                    also puts the W in your menu bar unless --no-menubar
                                    -d / --detach runs it in the background (logs: ~/.wrud/server.log)
  wrud doctor                       verify capture works end-to-end
  wrud install-hooks [--agent <${providerIds.join("|")}>] [--user|--project]
                                    wire your installed agents (auto-detected; --agent picks one)
  wrud stop                         stop the running wrud server (on WRUD_PORT)
  wrud menubar                      install + launch the macOS menu bar app (start/stop,
                                    dashboard, today's usage in your menu bar)
  wrud cleanup [--dry-run] [--yes]  remove everything wrud installed (data, tokens, hooks); undo install
  wrud hook <record|flush|finalize> [--provider <id>]   (invoked by the agent's hook config)

Supported agents: ${providerIds.join(", ")}.
Env: WRUD_PORT, WRUD_DB, WRUD_BASE_URL, WRUD_API_KEY, WRUD_AGENT_NAME, WRUD_AGENT_VERSION,
     WRUD_ANTHROPIC_KEY, WRUD_NARRATOR_CMD, WRUD_NARRATOR_MODEL
`;

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case undefined:
  case "run":
  case "start":
  // bare flags still mean "start the server" (wrud -d, wrud --no-install-hooks)
  case "-d":
  case "--detach":
  case "--no-install-hooks":
  case "--no-menubar":
    await runServer(CLI_PATH);
    break;
  case "doctor":
    process.exit(await runDoctor());
    break;
  case "install-hooks":
    process.exit(await runInstallHooks(rest, CLI_PATH));
    break;
  case "stop":
    process.exit(await runStop());
    break;
  case "menubar":
    process.exit(runMenubar(CLI_PATH));
    break;
  case "cleanup":
  case "uninstall":
    process.exit(await runCleanup(rest));
    break;
  case "hook":
    await runHook(rest[0] ?? "", CLI_PATH);
    break;
  case "-h":
  case "--help":
  case "help":
    console.log(USAGE);
    break;
  default:
    console.error(`unknown command: ${cmd}\n\n${USAGE}`);
    process.exit(1);
}
