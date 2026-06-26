import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireScope } from "./auth-middleware.js";
import type { AppEnv } from "../app.js";
import type { ApiKeyScope } from "@wrud/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryRateLimiter } from "../ratelimit/memory.js";
import { hashApiKey } from "../auth/keys.js";
import { AppError, errorBody } from "./errors.js";

function appWith(scopes: ApiKeyScope[]) {
  const storage = new MemoryStorageAdapter();
  void storage.createApiKey({
    id: "k1",
    name: "n",
    prefix: "p",
    hash: hashApiKey("secret"),
    scopes,
    createdAt: "2026-06-25T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  const deps = {
    storage,
    summarizer: {} as never,
    rateLimiter: new MemoryRateLimiter(
      { limit: 1000, windowMs: 60000 },
      () => new Date(0),
    ),
    clock: () => new Date(0),
  };
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    if (err instanceof AppError)
      return c.json(errorBody(err), err.status as ContentfulStatusCode);
    return c.json(
      { error: { code: "internal", message: "internal error" } },
      500,
    );
  });
  app.use("*", async (c, next) => {
    c.set("deps", deps as never);
    await next();
  });
  app.get("/p", requireScope("read"), (c) =>
    c.json({ ok: true, keyId: c.get("apiKeyId") }),
  );
  return app;
}

describe("requireScope middleware", () => {
  it("401 without a key", async () => {
    expect((await appWith(["read"]).request("/p")).status).toBe(401);
  });
  it("401 with an unknown key", async () => {
    const res = await appWith(["read"]).request("/p", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });
  it("403 with insufficient scope", async () => {
    const res = await appWith(["ingest"]).request("/p", {
      headers: { authorization: "Bearer secret" },
    });
    expect(res.status).toBe(403);
  });
  it("200 with a valid key + scope, exposes keyId", async () => {
    const res = await appWith(["read"]).request("/p", {
      headers: { "x-api-key": "secret" },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).keyId).toBe("k1");
  });
});
