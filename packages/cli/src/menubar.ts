/**
 * `wrud menubar` - install the macOS menu bar app and launch it. The .app ships prebuilt
 * inside the npm tarball (dist/app/Wrud.app, universal binary), so this is just a copy to
 * /Applications + `open`. The app itself is a native shell over this CLI: start/stop the
 * server, open the dashboard, today's usage. Source: apps/menubar in the repo.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function runMenubar(cliPath: string): number {
  if (process.platform !== "darwin") {
    console.error("wrud menubar: the menu bar app is macOS-only.");
    return 1;
  }
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
          `wrud menubar: installed ${dest} and launched it - look for the record icon in your menu bar.`,
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
