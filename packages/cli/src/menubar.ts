/**
 * `wrud menubar` - install the macOS menu bar app and launch it. The .app ships prebuilt
 * inside the npm tarball (dist/app/Wrud.app, universal binary), so this is just a copy to
 * /Applications + `open`. The app itself is a native shell over this CLI: start/stop the
 * server, open the dashboard, today's usage. Source: apps/menubar in the repo.
 */
import { execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Record this node's bin dir in ~/.wrud/node-dir. Finder-launched apps get a bare PATH and
 * `zsh -lc` skips .zshrc (where nvm lives), so the menu bar app prepends this dir to find
 * node/npx/wrud when starting the server - the exact node that installed it.
 */
function writeNodeDir(): void {
  try {
    const home = join(homedir(), ".wrud");
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "node-dir"), dirname(process.execPath) + "\n");
  } catch {
    /* best-effort */
  }
}

/**
 * Plain `wrud` runs call this: put the W in the menu bar without being asked.
 * Silent no-op unless it actually has something to do - not macOS, `--no-menubar`,
 * the detached daemon child, the app already up, or a tarball built without the .app.
 */
export function autoMenubar(cliPath: string): void {
  if (process.platform !== "darwin") return;
  if (process.env.WRUD_DETACHED) return;
  if (process.argv.includes("--no-menubar")) return;
  if (!existsSync(join(dirname(cliPath), "app", "Wrud.app"))) return;
  writeNodeDir(); // refresh even when the app is already up (node may have moved)
  try {
    execSync("pgrep -x wrud-menubar", { stdio: "ignore" });
    return; // already in the menu bar
  } catch {
    /* not running - install + launch */
  }
  runMenubar(cliPath);
}

export function runMenubar(cliPath: string): number {
  if (process.platform !== "darwin") {
    console.error("wrud menubar: the menu bar app is macOS-only.");
    return 1;
  }
  writeNodeDir();
  const src = join(dirname(cliPath), "app", "Wrud.app");
  if (!existsSync(src)) {
    console.error(
      [
        "wrud menubar: Wrud.app is not bundled in this build (package built on a non-Mac?).",
        "Build from source: apps/menubar/build.sh in https://github.com/eliransu/wrud",
      ].join("\n"),
    );
    return 1;
  }
  // /Applications (admin-writable on default macOS) first, ~/Applications as fallback
  for (const parent of ["/Applications", join(homedir(), "Applications")]) {
    const dest = join(parent, "Wrud.app");
    try {
      mkdirSync(parent, { recursive: true });
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
      spawn("open", [dest], { stdio: "ignore", detached: true }).unref();
      console.log(
        [
          `wrud menubar: installed ${dest} and launched it - look for the W icon in your menu bar.`,
          `  tip: click it -> "Launch at Login" to keep it across reboots.`,
        ].join("\n"),
      );
      return 0;
    } catch {
      /* no write access - try the next location */
    }
  }
  console.error(
    "wrud menubar: could not write to /Applications or ~/Applications.",
  );
  return 1;
}
