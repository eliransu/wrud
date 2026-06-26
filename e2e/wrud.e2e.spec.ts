/**
 * End-to-end tests against a booted wrud server (Playwright webServer in
 * playwright.config.ts). Phase 1 has no browser UI yet, so this exercises the real HTTP
 * API through Playwright's request fixture, plus a real-browser load of the /docs route.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const ADMIN_KEY = readFileSync(".tmp-e2e/key.txt", "utf8").trim();
const adminAuth = { Authorization: `Bearer ${ADMIN_KEY}` };

test("health endpoint is ok", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("OpenAPI document is 3.1 and lists the v1 paths", async ({ request }) => {
  const doc = await (await request.get("/openapi.json")).json();
  expect(doc.openapi).toMatch(/^3\./);
  expect(Object.keys(doc.paths)).toContain("/v1/sessions");
  expect(Object.keys(doc.paths)).toContain("/v1/keys");
});

test("rejects unauthenticated requests with 401", async ({ request }) => {
  expect((await request.get("/v1/sessions")).status()).toBe(401);
});

test("full session lifecycle: create key -> session -> events -> summarize -> read", async ({
  request,
}) => {
  // admin mints a scoped ingest/read key (secret returned once)
  const keyRes = await request.post("/v1/keys", {
    headers: adminAuth,
    data: { name: "e2e-ingest", scopes: ["ingest", "read"] },
  });
  expect(keyRes.status()).toBe(201);
  const keyBody = await keyRes.json();
  expect(keyBody.apiKey.hash).toBeUndefined(); // never leaks the hash
  const ih = { Authorization: `Bearer ${keyBody.secret}` };

  const created = await request.post("/v1/sessions", {
    headers: ih,
    data: { user: { id: "u1" }, agent: { name: "claude-code" } },
  });
  expect(created.status()).toBe(201);
  const { sessionId } = await created.json();

  const appended = await request.post(`/v1/sessions/${sessionId}/events`, {
    headers: ih,
    data: {
      events: [
        {
          id: "e0",
          sessionId,
          seq: 0,
          timestamp: "2026-06-25T10:00:00.000Z",
          type: "tool_call",
          payload: { name: "Edit", ok: true },
        },
        {
          id: "e1",
          sessionId,
          seq: 1,
          timestamp: "2026-06-25T10:00:10.000Z",
          type: "model_use",
          payload: { model: "claude-opus-4-8", outputTokens: 40 },
        },
      ],
    },
  });
  expect(appended.status()).toBe(202);
  expect((await appended.json()).accepted).toBe(2);

  const sumRes = await request.post(`/v1/sessions/${sessionId}/summarize`, {
    headers: ih,
  });
  expect(sumRes.status()).toBe(200);
  const summary = await sumRes.json();
  expect(summary.stats.eventCount).toBe(2);
  expect(summary.stats.toolCalls).toEqual({ Edit: 1 });
  expect(summary.stats.models[0].model).toBe("claude-opus-4-8");

  const read = await request.get(`/v1/sessions/${sessionId}`, { headers: ih });
  const body = await read.json();
  expect(body.session.status).toBe("summarized");
  expect(body.summary.sessionId).toBe(sessionId);
});

test("an ingest-scoped key cannot manage keys (403)", async ({ request }) => {
  const keyRes = await request.post("/v1/keys", {
    headers: adminAuth,
    data: { name: "ingest-only", scopes: ["ingest"] },
  });
  const { secret } = await keyRes.json();
  const res = await request.get("/v1/keys", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(res.status()).toBe(403);
});

test("the /docs route serves the Swagger UI shell in a real browser", async ({
  page,
}) => {
  // Title + #ui container are in the served HTML (no CDN needed). Full operation rendering
  // additionally requires network access to the swagger-ui-dist CDN.
  const resp = await page.goto("/docs");
  expect(resp?.status()).toBe(200);
  await expect(page).toHaveTitle(/wrud API/);
  await expect(page.locator("#ui")).toBeAttached();
});
