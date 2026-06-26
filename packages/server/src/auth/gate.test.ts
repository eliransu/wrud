import { describe, it, expect } from "vitest";
import type { ApiKey } from "@wrud/shared";
import { ApiKeyGate } from "./gate.js";

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "k1",
  name: "n",
  prefix: "p",
  hash: "H",
  scopes: ["read"],
  createdAt: "2026-06-25T10:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  ...over,
});

describe("ApiKeyGate", () => {
  const gate = new ApiKeyGate();
  it("denies when key is missing -> 401", () => {
    expect(gate.authorize(undefined, "read")).toEqual({
      ok: false,
      status: 401,
      reason: "invalid api key",
    });
  });
  it("denies a revoked key -> 401", () => {
    expect(
      gate.authorize(key({ revokedAt: "2026-06-25T11:00:00.000Z" }), "read").ok,
    ).toBe(false);
  });
  it("denies insufficient scope -> 403", () => {
    expect(gate.authorize(key({ scopes: ["read"] }), "admin")).toEqual({
      ok: false,
      status: 403,
      reason: "insufficient scope",
    });
  });
  it("allows when scope present", () => {
    expect(gate.authorize(key({ scopes: ["read", "admin"] }), "admin")).toEqual(
      { ok: true },
    );
  });
});
