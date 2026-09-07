/**
 * Sliding-window rate limiter for the Enterprise DaaS API
 * (`src/app/api/v1/creators/query/route.ts`).
 *
 * Backed by Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`) when
 * `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are configured —
 * this is the only correct choice across multiple server instances, since
 * the limit state has to be shared, not per-process.
 *
 * When those env vars are absent (local dev, CI, unit tests) this module
 * falls back to a per-process in-memory sliding window instead of
 * throwing. That fallback is explicitly NOT correct under multiple
 * server instances (each process tracks its own counts) — it exists only
 * so development and test runs never crash on a missing Redis credential,
 * never as a production substitute for the real, shared limiter.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const DEFAULT_ENTERPRISE_LIMIT = 1000;
export const RATE_LIMIT_WINDOW_SECONDS = 60;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds when the window resets. */
  reset: number;
}

// =====================================================================================
// Upstash-backed limiter
// =====================================================================================

let redisClient: Redis | null | undefined; // undefined = not yet attempted

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  try {
    redisClient = new Redis({ url, token });
  } catch (err) {
    console.error('[rate-limit] failed to construct Upstash Redis client; falling back to in-memory limiter', err);
    redisClient = null;
  }

  return redisClient;
}

// One Ratelimit instance per distinct numeric limit — Upstash bakes the
// token count into the instance at construction time, but different API
// keys can carry different `rate_limit_rpm` values, so instances are
// created lazily per limit value rather than assuming a single global one.
const upstashLimitersByLimit = new Map<number, Ratelimit>();

function getUpstashLimiter(limit: number): Ratelimit | null {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  let limiter = upstashLimitersByLimit.get(limit);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${RATE_LIMIT_WINDOW_SECONDS} s`),
      analytics: false,
      prefix: 'pulsegrid:ratelimit',
    });
    upstashLimitersByLimit.set(limit, limiter);
  }

  return limiter;
}

// =====================================================================================
// In-memory fallback
// =====================================================================================

/** Caps how many distinct identifiers are tracked at once so this can never grow unbounded. */
const MAX_TRACKED_IDENTIFIERS = 5000;

class InMemorySlidingWindowLimiter {
  private readonly windows = new Map<string, number[]>();

  limit(identifier: string, max: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Re-inserting on every touch keeps Map iteration order acting as a
    // simple LRU, so eviction below always drops the least-recently-used
    // identifier rather than an arbitrary one.
    const existing = this.windows.get(identifier);
    this.windows.delete(identifier);

    const timestamps = (existing ?? []).filter((ts) => ts > windowStart);
    const success = timestamps.length < max;
    if (success) {
      timestamps.push(now);
    }
    this.windows.set(identifier, timestamps);

    if (this.windows.size > MAX_TRACKED_IDENTIFIERS) {
      const oldestKey = this.windows.keys().next().value;
      if (oldestKey !== undefined) {
        this.windows.delete(oldestKey);
      }
    }

    const remaining = Math.max(0, max - timestamps.length);
    const oldestTimestamp = timestamps[0] ?? now;

    return { success, limit: max, remaining, reset: oldestTimestamp + windowMs };
  }
}

const memoryLimiter = new InMemorySlidingWindowLimiter();

// =====================================================================================
// Public API
// =====================================================================================

/**
 * Checks (and, on success, consumes) one request against `identifier`'s
 * sliding window. Never throws: an Upstash-side failure degrades to the
 * in-memory limiter for that call rather than failing the request open or
 * hard-crashing the route.
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = DEFAULT_ENTERPRISE_LIMIT
): Promise<RateLimitResult> {
  const upstash = getUpstashLimiter(limit);

  if (upstash) {
    try {
      const result = await upstash.limit(identifier);
      return { success: result.success, limit: result.limit, remaining: result.remaining, reset: result.reset };
    } catch (err) {
      console.error('[rate-limit] Upstash request failed; falling back to in-memory limiter for this call', err);
      return memoryLimiter.limit(identifier, limit, RATE_LIMIT_WINDOW_SECONDS * 1000);
    }
  }

  return memoryLimiter.limit(identifier, limit, RATE_LIMIT_WINDOW_SECONDS * 1000);
}
