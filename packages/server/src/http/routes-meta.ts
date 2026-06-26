/** Unauthenticated meta routes: liveness, the OpenAPI document, and a Swagger UI page. */
import { Hono } from "hono";
import { buildOpenApiDoc } from "./openapi.js";

export const metaRoutes = new Hono();

metaRoutes.get("/health", (c) => c.json({ ok: true }));
metaRoutes.get("/openapi.json", (c) => c.json(buildOpenApiDoc()));
// Pinned swagger-ui-dist version (avoid unpinned CDN supply-chain risk).
const SWAGGER_VERSION = "5.17.14";
metaRoutes.get("/docs", (c) =>
  c.html(`<!doctype html><html><head><meta charset="utf-8"><title>wrud API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css"></head>
<body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#ui" });</script></body></html>`),
);
