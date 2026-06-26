/**
 * Build the publishable `wrud` package:
 *   1. vite-build the dashboard (production build -> same-origin API base) -> dist/web
 *   2. esbuild-bundle src/main.ts -> dist/cli.mjs (the native better-sqlite3 stays external)
 * The published tarball ships only dist/ (see package.json "files").
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PLATFORM = join(ROOT, "apps", "platform");
const DIST = join(HERE, "dist");

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

console.log("- building dashboard...");
// No VITE_WRUD_API -> a production vite build resolves the API base to same-origin.
execSync("npm -w @wrud/platform run build", { cwd: ROOT, stdio: "inherit", shell: true });
cpSync(join(PLATFORM, "dist"), join(DIST, "web"), { recursive: true });

console.log("- bundling server + CLI...");
await build({
  entryPoints: [join(HERE, "src", "main.ts")],
  outfile: join(DIST, "cli.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  external: ["better-sqlite3"], // native module - installed as a runtime dependency
  logLevel: "info",
});

console.log("ok built packages/cli/dist (cli.mjs + web/)");
