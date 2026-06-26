import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "./keys.js";

describe("api key crypto", () => {
  it("generates a wrud_sk_<env>_ key with a display prefix", () => {
    const { fullKey, prefix } = generateApiKey("local");
    expect(fullKey).toMatch(/^wrud_sk_local_[A-Za-z0-9_-]{40,}$/);
    expect(prefix.startsWith("wrud_sk_local_")).toBe(true);
    expect(prefix).not.toBe(fullKey); // truncated for display
  });
  it("hashes deterministically with sha256 hex", () => {
    expect(hashApiKey("abc")).toBe(hashApiKey("abc"));
    expect(hashApiKey("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("abc")).not.toBe(hashApiKey("abd"));
  });
});
