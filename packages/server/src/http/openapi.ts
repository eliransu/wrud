/**
 * OpenAPI 3.1 document built from the shared zod schemas, using zod 4's NATIVE
 * `z.toJSONSchema()` (draft-2020-12, which OpenAPI 3.1 is a superset of). No third-party
 * generator and no zod-version coupling - the contract derives directly from `shared`.
 */
import { z } from "zod";
import {
  createSessionRequestSchema,
  createSessionResponseSchema,
  appendEventsRequestSchema,
  appendEventsResponseSchema,
  summarizeRequestSchema,
  storeSummaryRequestSchema,
  sessionSchema,
  sessionSummarySchema,
  eventSchema,
  createKeyRequestSchema,
  createKeyResponseSchema,
  apiKeyPublicSchema,
  errorSchema,
  lessonSchema,
  overviewSchema,
  facetsResponseSchema,
  reportSummarySchema,
} from "@wrud/shared";

/** Convert a zod schema to an inline JSON-Schema object; never throws into doc building. */
const toJson = (schema: z.ZodType): Record<string, unknown> => {
  try {
    const j = z.toJSONSchema(schema) as Record<string, unknown>;
    delete j.$schema;
    return j;
  } catch {
    return {};
  }
};

const body = (schema: z.ZodType) => ({
  content: { "application/json": { schema: toJson(schema) } },
});

export function buildOpenApiDoc() {
  return {
    openapi: "3.1.0",
    info: {
      title: "wrud API",
      version: "0.1.0",
      description: "What R U Doing - local-first AI agent session recorder.",
    },
    components: {
      securitySchemes: { ApiKey: { type: "http", scheme: "bearer" } },
    },
    security: [{ ApiKey: [] }],
    paths: {
      "/v1/sessions": {
        post: {
          summary: "Create a session (scope: ingest)",
          requestBody: body(createSessionRequestSchema),
          responses: {
            "201": {
              description: "created",
              ...body(createSessionResponseSchema),
            },
            "400": { description: "validation error", ...body(errorSchema) },
          },
        },
        get: {
          summary: "List sessions (scope: read)",
          description:
            "Filterable + paginated (keyset via cursor, or numbered pages via offset). Each facet dim accepts a comma-separated list (OR within a dim, AND across dims): user, agent, model, tool, mcp, skill, command, file_ext, error_kind, status. Plus from/to (ISO, createdAt range), minInputTokens, minOutputTokens, hasError, limit, cursor, offset. `total` counts all rows matching the filter.",
          responses: {
            "200": {
              description: "paginated sessions",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: toJson(sessionSchema) },
                      nextCursor: { type: ["string", "null"] },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/sessions/{id}/events": {
        post: {
          summary: "Append events (scope: ingest)",
          requestBody: body(appendEventsRequestSchema),
          responses: {
            "202": {
              description: "accepted",
              ...body(appendEventsResponseSchema),
            },
          },
        },
        get: {
          summary: "List session events (scope: read)",
          description:
            "Paginated: limit, cursor (keyset) or offset (numbered pages), order=asc|desc (by seq, default asc). `total` counts all events in the session.",
          responses: {
            "200": {
              description: "paginated events",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: toJson(eventSchema) },
                      nextCursor: { type: ["string", "null"] },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/sessions/{id}/summarize": {
        post: {
          summary:
            "Summarize a session (scope: ingest). mode=server (default) summarizes now; mode=client parks it in 'summarizing' for the caller to PUT a summary.",
          requestBody: body(summarizeRequestSchema),
          responses: {
            "200": {
              description: "session summary (server mode)",
              ...body(sessionSummarySchema),
            },
            "202": {
              description: "accepted; awaiting caller summary (client mode)",
            },
          },
        },
      },
      "/v1/sessions/{id}/summary": {
        put: {
          summary:
            "Store a caller-produced summary and finalize the session (scope: ingest)",
          requestBody: body(storeSummaryRequestSchema),
          responses: {
            "200": {
              description: "stored summary",
              ...body(sessionSummarySchema),
            },
          },
        },
      },
      "/v1/sessions/{id}": {
        get: {
          summary: "Get a session + its summary (scope: read)",
          responses: {
            "200": {
              description: "session and summary",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      session: toJson(sessionSchema),
                      summary: {
                        anyOf: [toJson(sessionSummarySchema), { type: "null" }],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/keys": {
        post: {
          summary: "Create an API key (scope: admin) - secret returned once",
          requestBody: body(createKeyRequestSchema),
          responses: {
            "201": { description: "created", ...body(createKeyResponseSchema) },
          },
        },
        get: {
          summary: "List API keys (scope: admin) - no secrets",
          responses: {
            "200": {
              description: "keys",
              content: {
                "application/json": {
                  schema: { type: "array", items: toJson(apiKeyPublicSchema) },
                },
              },
            },
          },
        },
      },
      "/v1/keys/{id}": {
        delete: {
          summary: "Revoke an API key (scope: admin)",
          responses: { "204": { description: "revoked" } },
        },
      },
      "/v1/lessons": {
        get: {
          summary: "List lessons (scope: read)",
          responses: {
            "200": {
              description: "paginated lessons",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: toJson(lessonSchema) },
                      nextCursor: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/stats/overview": {
        get: {
          summary: "Enterprise rollup across all sessions (scope: read)",
          responses: {
            "200": { description: "overview", ...body(overviewSchema) },
          },
        },
      },
      "/v1/facets": {
        get: {
          summary:
            "Distinct facet values + session counts per dimension (scope: read). ?dim=<dim> for one dimension, ?q=<prefix> for type-ahead.",
          responses: {
            "200": {
              description: "dimension -> [{ value, sessions }]",
              ...body(facetsResponseSchema),
            },
          },
        },
      },
      "/v1/reports/summary": {
        get: {
          summary:
            "Total + per-dimension top values + daily trend over a filter (scope: read). Accepts the same query params as GET /v1/sessions, plus ?top=<N> values per dim.",
          responses: {
            "200": {
              description: "report aggregate",
              ...body(reportSummarySchema),
            },
          },
        },
      },
    },
  };
}
