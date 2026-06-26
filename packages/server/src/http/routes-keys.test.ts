import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { DeterministicSummarizer } from "../summarize/deterministic.js";
import { hashApiKey } from "../auth/keys.js";

function setup() {
  const storage = new MemoryStorageAdapter();
  void storage.createApiKey({
    id: "admin",
    name: "boot",
    prefix: "p",
    hash: hashApiKey("ADMIN"),
    scopes: ["admin"],
    createdAt: "2026-06-25T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  const app = buildApp({
    storage,
    summarizer: new DeterministicSummarizer(() => new Date(0)),
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date("2026-06-25T10:00:00.000Z"),
  });
  return {
    app,
    storage,
    h: { authorization: "Bearer ADMIN", "content-type": "application/json" },
  };
}

describe("key routes", () => {
  it("creates a key returning the secret once, lists without hash, revokes", async () => {
    const { app, storage, h } = setup();
    const created = await app.request("/v1/keys", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "ingest key", scopes: ["ingest"] }),
    });
    expect(created.status).toBe(201);
    const reqBody = (await created.json()) as any;
    expect(reqBody.secret).toMatch(/^wrud_sk_local_/);
    expect(reqBody.apiKey.hash).toBeUndefined();

    // the returned secret actually works + was stored as a hash
    expect(
      await storage.getApiKeyByHash(hashApiKey(reqBody.secret)),
    ).toBeTruthy();

    const list = (await (
      await app.request("/v1/keys", { headers: h })
    ).json()) as any[];
    expect(list.find((k) => k.hash)).toBeUndefined();

    const del = await app.request(`/v1/keys/${reqBody.apiKey.id}`, {
      method: "DELETE",
      headers: h,
    });
    expect(del.status).toBe(204);
  });

  it("403 when caller lacks admin scope", async () => {
    const { app, storage } = setup();
    void storage.createApiKey({
      id: "r",
      name: "r",
      prefix: "p",
      hash: hashApiKey("READ"),
      scopes: ["read"],
      createdAt: "2026-06-25T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    });
    const res = await app.request("/v1/keys", {
      method: "POST",
      headers: {
        authorization: "Bearer READ",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "x", scopes: ["read"] }),
    });
    expect(res.status).toBe(403);
  });
});
