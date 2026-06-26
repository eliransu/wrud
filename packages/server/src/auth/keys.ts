/**
 * API key generation + hashing. Only the full key is secret; we persist its SHA-256
 * hash (acceptable without a KDF because the key is 32 random bytes - high entropy)
 * plus a non-secret truncated prefix for display in lists/UI.
 */
import { randomBytes, createHash } from "node:crypto";

export type KeyEnv = "local" | "live";

export function generateApiKey(env: KeyEnv = "local"): {
  fullKey: string;
  prefix: string;
} {
  const random = randomBytes(32).toString("base64url");
  const fullKey = `wrud_sk_${env}_${random}`;
  const prefix = `${fullKey.slice(0, `wrud_sk_${env}_`.length + 4)}...`;
  return { fullKey, prefix };
}

export function hashApiKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}
