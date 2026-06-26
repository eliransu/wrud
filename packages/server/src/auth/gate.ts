/**
 * ApiKeyGate - the pure authorization decision: given the looked-up key (or undefined)
 * and the scope a route requires, return allow / deny with an HTTP status. No I/O, no
 * storage, no clock - trivially unit-testable. Rate limiting is a separate concern
 * (RateLimiter); storage lookup + lastUsedAt touch happen in the middleware.
 */
import type { ApiKey, ApiKeyScope } from "@wrud/shared";

export type AuthDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403; reason: string };

export class ApiKeyGate {
  authorize(key: ApiKey | undefined, required: ApiKeyScope): AuthDecision {
    if (!key || key.revokedAt)
      return { ok: false, status: 401, reason: "invalid api key" };
    if (!key.scopes.includes(required))
      return { ok: false, status: 403, reason: "insufficient scope" };
    return { ok: true };
  }
}
