/**
 * `wrud` (default) - one process serving the API AND the pre-built dashboard from one origin.
 * Robustness fixes from real-world pain:
 *   - if a healthy wrud is already on the port -> ATTACH: print the token + URL and exit 0
 *     (instead of crashing with EADDRINUSE),
 *   - if the port is held by something else -> step to the next port (no raw Node stack trace),
 *   - the banner prints the REAL dashboard URL and labels the token's scopes.
 */
import { serve } from "@hono/node-server";
import {
  buildApp,
  SqliteStorageAdapter,
  MemoryRateLimiter,
  buildSummarizer,
  anthropicNarrator,
  defaultAnalyzers,
} from "@wrud/server/local";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import {
  ADMIN_TOKEN_FILE,
  DB,
  PORT,
  ensureHome,
  ensureToken,
  http,
} from "./env.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin")
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    else if (process.platform === "win32")
      spawn("cmd", ["/c", "start", "", url], {
        stdio: "ignore",
        detached: true,
      }).unref();
    else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* headless - fine */
  }
}

function banner(
  port: number,
  token: string,
  opened: boolean,
  attached: boolean,
): void {
  const url = `http://localhost:${port}`;
  console.log(
    [
      "",
      "  +------------------------------------------------------------------+",
      `  |  wrud is ${attached ? "already running" : "running        "}                                          |`,
      "  +------------------------------------------------------------------+",
      `   Open      : ${url}   ${opened ? "(opening in your browser)" : ""}`,
      `   API docs  : ${url}/docs        -   DB: ${DB}`,
      "",
      "   Token (scopes: admin, read, ingest) - paste on the Connect screen:",
      "",
      `       ${token}`,
      "",
      attached
        ? "   (a wrud server was already on this port - attached to it.)"
        : "   Ctrl+C to stop.",
      "",
    ].join("\n"),
  );
}

export async function runServer(cliPath: string): Promise<void> {
  ensureHome();
  const WEB = join(dirname(cliPath), "web"); // dist/web

  // Already running? Attach instead of crashing.
  const health = await http("GET", "/health");
  if (health.ok) {
    const token = await ensureToken(ADMIN_TOKEN_FILE, "wrud-cli-admin", [
      "admin",
      "read",
      "ingest",
    ]);
    const url = `http://localhost:${PORT}`;
    openBrowser(url);
    banner(PORT, token, true, true);
    return;
  }

  const token = await ensureToken(ADMIN_TOKEN_FILE, "wrud-cli-admin", [
    "admin",
    "read",
    "ingest",
  ]);
  const anthropicKey = process.env.WRUD_ANTHROPIC_KEY;
  const app = buildApp({
    storage: new SqliteStorageAdapter(DB),
    summarizer: buildSummarizer({
      analyzers: defaultAnalyzers(),
      narrator: anthropicKey ? anthropicNarrator(anthropicKey) : undefined,
    }),
    rateLimiter: new MemoryRateLimiter({ limit: 120, windowMs: 60_000 }),
  });

  app.get("*", (c) => {
    const path = decodeURIComponent(new URL(c.req.url).pathname);
    const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
    const filePath = normalize(join(WEB, rel));
    const target =
      filePath.startsWith(WEB) &&
      existsSync(filePath) &&
      statSync(filePath).isFile()
        ? filePath
        : join(WEB, "index.html");
    c.header(
      "content-type",
      MIME[extname(target)] ?? "application/octet-stream",
    );
    return c.body(new Uint8Array(readFileSync(target)));
  });

  const MAX_PORT_TRIES = 5;
  const startOn = (port: number, attempt: number): void => {
    const server = serve({ fetch: app.fetch, port }, (info) => {
      const url = `http://localhost:${info.port}`;
      openBrowser(url);
      banner(info.port, token, true, false);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attempt < MAX_PORT_TRIES) {
        console.log(`- port ${port} is busy - trying ${port + 1}...`);
        startOn(port + 1, attempt + 1);
      } else {
        console.error(
          `wrud could not start: ${err.code === "EADDRINUSE" ? `ports ${PORT}-${port} are all busy` : err.message}`,
        );
        process.exit(1);
      }
    });
  };
  startOn(PORT, 0);
}
