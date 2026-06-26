/**
 * Seed a bootstrap admin key into the local DB so the first POST /v1/keys can be
 * authorized. Prints the plaintext ONCE - copy it now, it is never recoverable.
 * Usage: WRUD_DB=./wrud.db npm run seed:key
 */
import { SqliteStorageAdapter } from "../src/storage/sqlite.js";
import { generateApiKey, hashApiKey } from "../src/auth/keys.js";
import { newId } from "@wrud/shared";

const storage = new SqliteStorageAdapter(process.env.WRUD_DB ?? "./wrud.db");
const { fullKey, prefix } = generateApiKey("local");
await storage.createApiKey({
  id: newId(),
  name: "bootstrap-admin",
  prefix,
  hash: hashApiKey(fullKey),
  scopes: ["admin", "read", "ingest"],
  createdAt: new Date().toISOString(),
  lastUsedAt: null,
  revokedAt: null,
});
console.log("Bootstrap admin key (shown once):\n\n  " + fullKey + "\n");
