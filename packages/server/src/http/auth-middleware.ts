/**
 * requireScope - Hono middleware: extract the key (Bearer or x-api-key), look it up by
 * hash, run the pure ApiKeyGate for the route's required scope, enforce the per-key rate
 * limit, stamp lastUsedAt via the injected clock, and expose the key id to handlers.
 */
import type { MiddlewareHandler } from "hono";
import type { ApiKeyScope } from "@wrud/shared";
import type { AppEnv } from "../app.js";
import { ApiKeyGate } from "../auth/gate.js";
import { hashApiKey } from "../auth/keys.js";
import { AppError } from "./errors.js";

const gate = new ApiKeyGate();

function extractKey(c: {
  req: { header: (n: string) => string | undefined };
}): string | undefined {
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return c.req.header("x-api-key") ?? undefined;
}

export function requireScope(scope: ApiKeyScope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { storage, rateLimiter, clock } = c.get("deps");
    const presented = extractKey(c);
    if (!presented) throw new AppError(401, "unauthorized", "missing api key");

    const key = await storage.getApiKeyByHash(hashApiKey(presented));
    const decision = gate.authorize(key, scope);
    if (!decision.ok) {
      throw new AppError(
        decision.status,
        decision.status === 401 ? "unauthorized" : "forbidden",
        decision.reason,
      );
    }

    const rl = rateLimiter.check(key!.id);
    if (!rl.ok)
      throw new AppError(429, "rate_limited", "rate limit exceeded", {
        retryAfterMs: rl.retryAfterMs,
      });

    await storage.touchApiKey(key!.id, clock().toISOString());
    c.set("apiKeyId", key!.id);
    await next();
  };
}
