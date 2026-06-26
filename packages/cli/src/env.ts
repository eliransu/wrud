/**
 * Shared CLI environment: canonical paths, server/token resolution, key minting, and a tiny
 * fetch helper. ONE canonical DB (~/.wrud/wrud.db) and ONE base URL so the server, the hooks,
 * and `doctor`/`install-hooks` never disagree about where data lives (the "two databases,
 * silently" footgun). Everything is overridable by env for power users.
 */
import {
  SqliteStorageAdapter,
  generateApiKey,
  hashApiKey,
} from "@wrud/server/local";
import { newId } from "@wrud/shared";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOME = join(homedir(), ".wrud");
export const DB = process.env.WRUD_DB || join(HOME, "wrud.db");
export const PORT = Number(process.env.WRUD_PORT || 11190);
export const BASE = (
  process.env.WRUD_BASE_URL || `http://localhost:${PORT}`
).replace(/\/$/, "");

/** Admin/dashboard token (full scopes) and the least-privilege ingest token for hooks. */
export const ADMIN_TOKEN_FILE =
  process.env.WRUD_TOKEN_FILE || join(HOME, "token");
export const INGEST_TOKEN_FILE =
  process.env.WRUD_INGEST_TOKEN_FILE || join(HOME, "ingest-token");
export const LOG_FILE = join(HOME, "hooks.log");

export type Scope = "ingest" | "read" | "admin";

export function ensureHome(): void {
  mkdirSync(HOME, { recursive: true });
}

/** Mint a fresh key directly into the local DB and return the plaintext (caller persists it). */
export async function mintKey(name: string, scopes: Scope[]): Promise<string> {
  const storage = new SqliteStorageAdapter(DB);
  const { fullKey, prefix } = generateApiKey("local");
  await storage.createApiKey({
    id: newId(),
    name,
    prefix,
    hash: hashApiKey(fullKey),
    scopes,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  });
  return fullKey;
}

/** Reuse the token on disk if it's still a valid (non-revoked) key, else mint + persist a new one. */
export async function ensureToken(
  file: string,
  name: string,
  scopes: Scope[],
): Promise<string> {
  if (existsSync(file)) {
    const saved = readFileSync(file, "utf8").trim();
    if (saved) {
      const storage = new SqliteStorageAdapter(DB);
      const existing = await storage.getApiKeyByHash(hashApiKey(saved));
      if (existing && !existing.revokedAt) return saved;
    }
  }
  const fullKey = await mintKey(name, scopes);
  writeFileSync(file, fullKey + "\n", { mode: 0o600 });
  return fullKey;
}

/** The ingest token the hooks use: explicit env wins, then the dedicated file, then the admin file. */
export function resolveIngestToken(): string | undefined {
  if (process.env.WRUD_API_KEY) return process.env.WRUD_API_KEY;
  for (const f of [INGEST_TOKEN_FILE, ADMIN_TOKEN_FILE]) {
    if (existsSync(f)) {
      const t = readFileSync(f, "utf8").trim();
      if (t) return t;
    }
  }
  return undefined;
}

export interface HttpResult {
  status: number;
  ok: boolean;
  json: any;
  error?: string;
}

/** Fetch returning status + parsed body, never throwing - callers branch on status. */
export async function http(
  method: string,
  path: string,
  token?: string,
  jsonBody?: unknown,
): Promise<HttpResult> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
    });
    let json: any = null;
    try {
      json = res.status === 204 ? null : await res.json();
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, ok: res.ok, json };
  } catch (e) {
    return {
      status: 0,
      ok: false,
      json: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
