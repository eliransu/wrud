/**
 * buildApp - the dependency-injection seam. Returns a configured Hono app with zero
 * global state. The Node entry hands it real adapters; tests hand it Memory* adapters
 * and exercise the same app in-process. The same app could be served from another
 * runtime by constructing that runtime's adapters and calling buildApp.
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type {
  StorageAdapter,
  Summarizer,
  RateLimiter,
  Clock,
} from "@wrud/shared";
import { AppError, errorBody } from "./http/errors.js";
import { metaRoutes } from "./http/routes-meta.js";
import { sessionRoutes } from "./http/routes-sessions.js";
import { keyRoutes } from "./http/routes-keys.js";
import { analyticsRoutes } from "./http/routes-analytics.js";
import { reportRoutes } from "./http/routes-reports.js";

/** Max request body (1 MB) - a 500-event batch is ~100 KB, so this is generous. */
const MAX_BODY_BYTES = 1024 * 1024;

export interface AppDeps {
  storage: StorageAdapter;
  summarizer: Summarizer;
  rateLimiter: RateLimiter;
  clock?: Clock;
  /** Allowed browser origins for the platform (CORS). Omit to disable CORS. */
  corsOrigins?: string[];
}

/** The runtime dependencies handlers read from context (clock resolved). */
export interface RuntimeDeps {
  storage: StorageAdapter;
  summarizer: Summarizer;
  rateLimiter: RateLimiter;
  clock: Clock;
}

export type AppEnv = {
  Variables: { deps: RuntimeDeps; apiKeyId: string };
};

export function buildApp(deps: AppDeps) {
  const resolved: RuntimeDeps = {
    storage: deps.storage,
    summarizer: deps.summarizer,
    rateLimiter: deps.rateLimiter,
    clock: deps.clock ?? (() => new Date()),
  };
  const app = new Hono<AppEnv>();

  if (deps.corsOrigins?.length) {
    app.use(
      "*",
      cors({
        origin: deps.corsOrigins,
        allowHeaders: ["Authorization", "x-api-key", "Content-Type"],
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      }),
    );
  }
  app.use("*", secureHeaders());
  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            error: {
              code: "payload_too_large",
              message: "request body too large",
            },
          },
          413,
        ),
    }),
  );
  app.use("*", async (c, next) => {
    c.set("deps", resolved);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      // RFC 6585: advertise back-off on rate-limit responses.
      const details = err.details as { retryAfterMs?: number } | undefined;
      if (err.status === 429 && details?.retryAfterMs != null) {
        c.header("Retry-After", String(Math.ceil(details.retryAfterMs / 1000)));
      }
      return c.json(errorBody(err), err.status as ContentfulStatusCode);
    }
    console.error("unhandled error:", err); // never logs request bodies/secrets
    return c.json(
      { error: { code: "internal", message: "internal error" } },
      500,
    );
  });

  app.route("/", metaRoutes);
  app.route("/v1", sessionRoutes);
  app.route("/v1", keyRoutes);
  app.route("/v1", analyticsRoutes);
  app.route("/v1", reportRoutes);
  return app;
}
