import { describe, it, expect } from "vitest";
import { newId, isoString, apiKeyScopes } from "@wrud/shared";

describe("@wrud/shared barrel", () => {
  it("exposes newId returning a uuid-like string", () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("exposes isoString validator and scopes", () => {
    expect(isoString.safeParse("2026-06-25T10:00:00.000Z").success).toBe(true);
    expect(apiKeyScopes.length).toBe(3);
  });
});
