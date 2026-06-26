import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { MemoryRateLimiter } from "./ratelimit/memory.js";
import { DeterministicSummarizer } from "./summarize/deterministic.js";

const makeApp = () =>
  buildApp({
    storage: new MemoryStorageAdapter(),
    summarizer: new DeterministicSummarizer(
      () => new Date("2026-06-25T11:00:00.000Z"),
    ),
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date("2026-06-25T10:00:00.000Z"),
  });

describe("meta routes", () => {
  it("GET /health returns ok", async () => {
    const res = await makeApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("GET /openapi.json returns an openapi 3.x document with the expected paths", async () => {
    const res = await makeApp().request("/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as any;
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths)).toContain("/v1/sessions");
    expect(Object.keys(doc.paths)).toContain("/v1/keys");
  });
});
