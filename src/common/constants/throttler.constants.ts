/**
 * Throttler limits per route group. See SysDesign §11.2.
 *
 * Only `global` is registered in ThrottlerModule.forRoot as the unnamed
 * default throttler (100 req/min fallback). Routes that need a stricter
 * cap override it with @Throttle({ default: { limit, ttl } }).
 */
export const THROTTLER_LIMITS = {
  /** Global fallback — 100 req/min */
  global: { ttl: 60_000, limit: 100 },
  /** Strict — 5 req/min (e.g. POST /users, POST /authentications) */
  strict: { ttl: 60_000, limit: 5 },
  /** Moderate — 10 req/min (e.g. PUT /authentications, POST /documents) */
  moderate: { ttl: 60_000, limit: 10 },
} as const;

export type ThrottlerLimitName = keyof typeof THROTTLER_LIMITS;
