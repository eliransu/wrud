/**
 * `wrud cleanup [--dry-run] [--yes]` (alias: `uninstall`) - removes everything wrud put on this
 * machine and undoes `install-hooks`:
 *   - the local data dir ~/.wrud (SQLite db, admin + ingest tokens, hooks.log),
 *   - the temp session buffers ($TMPDIR/wrud-sessions),
 *   - wrud's hook entries in every supported agent's settings, user AND project scope.
 * Shared settings files are edited SURGICALLY - only wrud's own hooks are stripped (the provider
 * registry owns that logic); your own config is never touched, and a file that wrud created which
 * ends up empty is deleted. Destructive, so it prints the plan and confirms before doing anything
 * (skip with --yes); --dry-run prints the plan and stops.
 */
import {
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import {
  ADMIN_TOKEN_FILE,
  DB,
  HOME,
  INGEST_TOKEN_FILE,
  LOG_FILE,
} from "./env.js";
import { getProvider, providerIds } from "./providers.js";
import { stopServers } from "./stop.js";

const TEMP_DIR = join(tmpdir(), "wrud-sessions");

interface Target {
  group: "hooks" | "data" | "temp";
  label: string;
  path: string;
  note: string;
  apply: () => void;
}

/** Is `p` inside directory `dir` (so removing `dir` already covers it)? */
function isUnder(p: string, dir: string): boolean {
  const rel = relative(dir, p);
  return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}

/** wrud's hook entries in each agent's settings, both scopes. Only files that actually contain
 * wrud hooks are listed; the file is read-tested so unreadable/non-JSON config is left alone. */
function planHooks(): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  for (const id of providerIds) {
    const provider = getProvider(id);
    for (const scope of ["user", "project"] as const) {
      const path = provider.settingsPath(scope);
      if (!existsSync(path)) continue;
      // user & project can be the SAME file (run from $HOME), possibly reached via a symlink
      // (e.g. /tmp -> /private/tmp), so the strings differ. Dedupe by real path: never twice.
      let key = path;
      try {
        key = realpathSync(path);
      } catch {
        /* keep path */
      }
      if (seen.has(key)) continue;
      seen.add(key);
      let settings: any;
      try {
        settings = JSON.parse(readFileSync(path, "utf8") || "{}");
      } catch {
        continue; // not JSON / unreadable - never touch it
      }
      if (!provider.hasWrudHooks(settings)) continue;

      // Decide the note (strip vs delete) on a clone so we don't mutate the planned object yet.
      const probe = structuredClone(settings);
      provider.removeHooks(probe);
      const willEmpty = Object.keys(probe).length === 0;

      out.push({
        group: "hooks",
        label: `${provider.label} · ${scope}`,
        path,
        note: willEmpty
          ? "strip wrud hooks (file empties → delete)"
          : "strip wrud hooks",
        apply: () => {
          provider.removeHooks(settings);
          if (Object.keys(settings).length === 0)
            rmSync(path, { force: true }); // ENOENT-safe even if already gone
          else writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
        },
      });
    }
  }
  return out;
}

/** The data the recorder writes. Removing ~/.wrud covers the defaults; env-overridden paths that
 * live outside ~/.wrud are removed individually so `WRUD_DB=/elsewhere` is cleaned up too. */
function planData(): Target[] {
  const out: Target[] = [];
  if (existsSync(HOME))
    out.push({
      group: "data",
      label: "data dir",
      path: HOME,
      note: "db, admin + ingest tokens, hooks.log",
      apply: () => rmSync(HOME, { recursive: true, force: true }),
    });
  const stray = [
    [DB, "database"],
    [ADMIN_TOKEN_FILE, "admin token"],
    [INGEST_TOKEN_FILE, "ingest token"],
    [LOG_FILE, "hooks log"],
  ] as const;
  for (const [path, what] of stray) {
    if (existsSync(path) && !isUnder(path, HOME))
      out.push({
        group: "data",
        label: what,
        path,
        note: "env-overridden location",
        apply: () => rmSync(path, { force: true }),
      });
  }
  return out;
}

function planTemp(): Target[] {
  if (!existsSync(TEMP_DIR)) return [];
  return [
    {
      group: "temp",
      label: "session buffers",
      path: TEMP_DIR,
      note: "in-flight session ndjson/state",
      apply: () => rmSync(TEMP_DIR, { recursive: true, force: true }),
    },
  ];
}

function printPlan(targets: Target[]): void {
  const groups: Array<[Target["group"], string]> = [
    ["hooks", "hooks"],
    ["data", "data"],
    ["temp", "temp"],
  ];
  for (const [g, heading] of groups) {
    const items = targets.filter((t) => t.group === g);
    if (!items.length) continue;
    console.log(`  ${heading}`);
    for (const t of items)
      console.log(`    ${t.label.padEnd(22)} ${t.path}\n      ${t.note}`);
  }
}

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

export async function runCleanup(args: string[]): Promise<number> {
  const dryRun = args.includes("--dry-run") || args.includes("-n");
  const yes = args.includes("--yes") || args.includes("-y");

  const targets = [...planHooks(), ...planData(), ...planTemp()];

  console.log("wrud cleanup\n");
  if (targets.length === 0) {
    console.log(
      "  Nothing to remove - wrud isn't installed on this machine.\n",
    );
    return 0;
  }
  console.log("This will remove:\n");
  printPlan(targets);
  console.log("");

  if (dryRun) {
    console.log("  --dry-run: nothing was changed.\n");
    return 0;
  }

  if (!yes) {
    if (!process.stdin.isTTY) {
      console.error(
        "  Refusing to delete without confirmation in a non-interactive shell. Re-run with --yes.\n",
      );
      return 1;
    }
    const ok = await confirm("Remove all of the above? [y/N] ");
    if (!ok) {
      console.log("\n  Aborted. Nothing was changed.\n");
      return 1;
    }
  }

  // A live server recreates ~/.wrud the instant it's deleted - stop it first.
  const stopped = stopServers();
  if (stopped) {
    console.log(
      `  stopped ${stopped} running server${stopped === 1 ? "" : "s"}`,
    );
    await new Promise((r) => setTimeout(r, 400));
  }

  let done = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      t.apply();
      done++;
    } catch (e) {
      failed++;
      console.error(
        `  ! could not remove ${t.path}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(
    `\n  Removed ${done} item${done === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}. wrud is uninstalled.\n`,
  );
  return failed ? 1 : 0;
}
