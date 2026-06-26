#!/usr/bin/env node
/**
 * `wrud` - one-command local launcher.
 * Seeds a local API key, starts the API (:11190) + the Ant Design dashboard (:11191),
 * opens the dashboard in your browser, and prints your local token to paste on the
 * Connect screen. Ctrl+C stops everything. Pure Node (no TS imports) so `npx wrud` works.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Anchor to the wrud package root (this file lives in <root>/bin/), NOT process.cwd() -
// so `wrud` works the same whether it's run via `npm run wrud` or as a global binary.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DB = process.env.WRUD_DB || join(ROOT, "wrud.db");
const API_PORT = process.env.WRUD_PORT || "11190";
const WEB_PORT = process.env.WRUD_WEB_PORT || "11191";
const env = { ...process.env, WRUD_DB: DB, WRUD_PORT: API_PORT };
const sh = { shell: true };

function ensureDeps() {
  if (!existsSync(join(ROOT, "node_modules"))) {
    console.log("- installing dependencies (first run)...");
    execSync("npm install", { stdio: "inherit", ...sh });
  }
}

function seedKey() {
  try {
    const out = execSync("npm run -s seed:key", { env, encoding: "utf8", ...sh });
    const m = out.match(/wrud_sk_local_[A-Za-z0-9_-]+/);
    return m ? m[0] : null;
  } catch (e) {
    console.error("- could not seed a key:", e?.message ?? e);
    console.error("  (you can run `npm run seed:key` manually once the server is up)");
    return null;
  }
}

async function waitFor(url, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status >= 200 && r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function openBrowser(url) {
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else if (process.platform === "win32") {
      // `start` is a shell builtin - needs a shell, and an empty title arg.
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {
    /* headless / no browser - fine */
  }
}

ensureDeps();
console.log("- seeding a local API key...");
const token = seedKey();
console.log(`- starting API (:${API_PORT}) + dashboard (:${WEB_PORT})...`);
const api = spawn("npm", ["run", "-s", "serve"], { env, stdio: "ignore", ...sh });
// Pass the port through to Vite (--strictPort so it fails loudly instead of drifting to
// another port, which would leave us waiting on the wrong one).
const web = spawn(
  "npm",
  ["-w", "@wrud/platform", "run", "-s", "dev", "--", "--port", WEB_PORT, "--strictPort"],
  {
    env: { ...env, VITE_WRUD_API: `http://localhost:${API_PORT}` },
    stdio: "ignore",
    ...sh,
  },
);

const cleanup = () => {
  try {
    api.kill();
  } catch {}
  try {
    web.kill();
  } catch {}
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
// Don't orphan the API/dashboard if the launcher itself crashes.
process.on("uncaughtException", (err) => {
  console.error(err);
  cleanup();
});
process.on("unhandledRejection", (err) => {
  console.error(err);
  cleanup();
});

await waitFor(`http://localhost:${API_PORT}/health`);
const up = await waitFor(`http://localhost:${WEB_PORT}`);
if (up) openBrowser(`http://localhost:${WEB_PORT}`);

console.log(
  [
    "",
    "  +------------------------------------------------------------------+",
    "  |  wrud is running                                                   |",
    "  +------------------------------------------------------------------+",
    `   Dashboard : http://localhost:${WEB_PORT}   ${up ? "(opening in your browser)" : "(open it manually)"}`,
    `   API       : http://localhost:${API_PORT}   -   docs: http://localhost:${API_PORT}/docs`,
    "",
    "   Paste this token on the Connect screen:",
    "",
    `       ${token ?? "(could not seed a key - run `npm run seed:key`)"}`,
    "",
    "   Ctrl+C to stop.",
    "",
  ].join("\n"),
);
