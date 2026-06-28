---
sidebar_position: 4
title: HTTP API
---

# HTTP API

wrud runs a local REST API (default `http://localhost:11190`). The dashboard, the hooks, and the SDK all talk to it. Interactive, always-current API docs are served at **`/docs`** (OpenAPI at `/openapi.json`) by your running server.

## Authentication

Every `/v1/*` request needs a bearer token:

```
Authorization: Bearer <token>
```

Tokens carry scopes, least-privilege:

| Scope    | Can                                                              |
| -------- | ---------------------------------------------------------------- |
| `ingest` | create sessions + append events + summarize (what the hooks use) |
| `read`   | read sessions, events, stats, lessons (what the dashboard uses)  |
| `admin`  | manage API keys                                                  |

`npx @wrud/cli` prints an admin/read/ingest token for the dashboard; `install-hooks` mints a dedicated `ingest`-only token for the hooks.

## Health

```bash
curl http://localhost:11190/health
# {"ok":true}
```

## Sessions

| Method & path                     | Scope  | Purpose                                     |
| --------------------------------- | ------ | ------------------------------------------- |
| `POST /v1/sessions`               | ingest | open a session → `{ sessionId, startedAt }` |
| `POST /v1/sessions/:id/events`    | ingest | append a batch of events                    |
| `POST /v1/sessions/:id/summarize` | ingest | finalize: recap + insights                  |
| `GET /v1/sessions`                | read   | list sessions → `{ items, nextCursor }`     |
| `GET /v1/sessions/:id`            | read   | one session (incl. `summary`)               |
| `GET /v1/sessions/:id/events`     | read   | the event timeline                          |

```bash
# open a session
curl -X POST http://localhost:11190/v1/sessions \
  -H "authorization: Bearer $WRUD_API_KEY" \
  -H "content-type: application/json" \
  -d '{"user":{"id":"me"},"agent":{"name":"my-script"}}'
```

## Analytics

| Method & path            | Scope | Purpose                                                               |
| ------------------------ | ----- | --------------------------------------------------------------------- |
| `GET /v1/stats/overview` | read  | totals: sessions by status, per-model calls/tokens, insights, lessons |
| `GET /v1/lessons`        | read  | lessons derived from insights → `{ items, nextCursor }`               |

## Keys

| Method & path         | Scope | Purpose                         |
| --------------------- | ----- | ------------------------------- |
| `GET /v1/keys`        | admin | list API keys                   |
| `POST /v1/keys`       | admin | mint a key (`{ name, scopes }`) |
| `DELETE /v1/keys/:id` | admin | revoke a key                    |

## Notes

- Request/response shapes are validated by a shared Zod contract — `/docs` is the source of truth.
- Everything is local-first: the API binds to `localhost` and stores to `~/.wrud/wrud.db`. Set `WRUD_CORS_ORIGIN` before exposing it anywhere non-local.
