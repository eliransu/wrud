/**
 * Local/embedded entry point - everything needed to stand up a self-contained wrud server
 * in one process (the published `wrud` CLI bundles this). Kept as a barrel so the CLI imports
 * through the package's `exports` map (`@wrud/server/local`) rather than reaching into `src/`.
 */
export { buildApp } from "./app.js";
export type { AppDeps } from "./app.js";
export { SqliteStorageAdapter } from "./storage/sqlite.js";
export { MemoryRateLimiter } from "./ratelimit/memory.js";
export { buildSummarizer } from "./summarize/composite.js";
export { anthropicNarrator } from "./summarize/anthropic.js";
export { defaultAnalyzers } from "./insights/index.js";
export { generateApiKey, hashApiKey } from "./auth/keys.js";
