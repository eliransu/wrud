/**
 * MemoryRateLimiter - pure sliding-window counter with an injected clock. Correct for a
 * single-process local server; a distributed backend would be a separate RateLimiter impl.
 */
import type { RateLimiter, Clock } from "@wrud/shared";

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private cfg: RateLimitConfig,
    private clock: Clock = () => new Date(),
  ) {}

  check(key: string): { ok: boolean; retryAfterMs?: number } {
    const now = this.clock().getTime();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.cfg.windowMs,
    );
    if (recent.length >= this.cfg.limit) {
      this.hits.set(key, recent);
      const retryAfterMs = this.cfg.windowMs - (now - recent[0]!);
      return { ok: false, retryAfterMs };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true };
  }
}
