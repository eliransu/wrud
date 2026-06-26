import { describe, it, expect } from "vitest";
import { MemoryRateLimiter } from "./memory.js";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit, then blocks with retryAfterMs", () => {
    const now = 0;
    const rl = new MemoryRateLimiter(
      { limit: 2, windowMs: 1000 },
      () => new Date(now),
    );
    expect(rl.check("k").ok).toBe(true);
    expect(rl.check("k").ok).toBe(true);
    const blocked = rl.check("k");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
  it("recovers after the window slides", () => {
    let now = 0;
    const rl = new MemoryRateLimiter(
      { limit: 1, windowMs: 1000 },
      () => new Date(now),
    );
    expect(rl.check("k").ok).toBe(true);
    expect(rl.check("k").ok).toBe(false);
    now = 1001;
    expect(rl.check("k").ok).toBe(true);
  });
  it("tracks keys independently", () => {
    const rl = new MemoryRateLimiter(
      { limit: 1, windowMs: 1000 },
      () => new Date(0),
    );
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("b").ok).toBe(true);
  });
});
