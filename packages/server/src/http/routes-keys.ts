/**
 * API key management (scope: admin). Creation returns the plaintext secret exactly once;
 * only the SHA-256 hash is stored. List/read never expose the hash.
 */
import { Hono } from "hono";
import {
  createKeyRequestSchema,
  apiKeyPublicSchema,
  newId,
  type ApiKey,
} from "@wrud/shared";
import type { AppEnv } from "../app.js";
import { requireScope } from "./auth-middleware.js";
import { AppError, zodIssues } from "./errors.js";
import { generateApiKey, hashApiKey } from "../auth/keys.js";

export const keyRoutes = new Hono<AppEnv>();

keyRoutes.post("/keys", requireScope("admin"), async (c) => {
  const { storage, clock } = c.get("deps");
  const parsed = createKeyRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new AppError(
      400,
      "bad_request",
      "validation failed",
      zodIssues(parsed.error.issues),
    );

  const { fullKey, prefix } = generateApiKey("local");
  const key: ApiKey = {
    id: newId(),
    name: parsed.data.name,
    prefix,
    hash: hashApiKey(fullKey),
    scopes: parsed.data.scopes,
    createdAt: clock().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  await storage.createApiKey(key);
  return c.json(
    { apiKey: apiKeyPublicSchema.parse(key), secret: fullKey },
    201,
  );
});

keyRoutes.get("/keys", requireScope("admin"), async (c) => {
  const { storage } = c.get("deps");
  const keys = (await storage.listApiKeys()).map((k) =>
    apiKeyPublicSchema.parse(k),
  );
  return c.json(keys, 200);
});

keyRoutes.delete("/keys/:id", requireScope("admin"), async (c) => {
  const { storage } = c.get("deps");
  await storage.revokeApiKey(c.req.param("id"));
  return c.body(null, 204);
});
