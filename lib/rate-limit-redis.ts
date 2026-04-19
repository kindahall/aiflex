/**
 * Optional Redis-backed rate limiter for multi-instance deployments.
 *
 * Algorithm: fixed-window counter using INCR + EXPIRE — atomic, fast,
 * Edge-compatible (no TCP socket, only HTTPS to Upstash). Slightly less
 * smooth than the in-memory sliding window, but the practical
 * difference for our limits is sub-second.
 *
 * Activation: set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
 * Without those, callers fall back to the in-memory limiter.
 */

import { RateLimitError } from "./rate-limit";

interface RateLimitResult {
  limit: number;
  remaining: number;
  reset: number; // Unix seconds
}

interface RedisLimiter {
  check(limit: number, token: string): Promise<RateLimitResult>;
}

function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function pipeline(
  commands: unknown[][]
): Promise<Array<{ result?: unknown; error?: string }>> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "") + "/pipeline";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
    // Edge runtime fetches accept signal from AbortSignal.timeout
    signal: AbortSignal.timeout(2_000),
  });
  if (!res.ok) {
    throw new Error(`Upstash pipeline HTTP ${res.status}`);
  }
  return (await res.json()) as Array<{ result?: unknown; error?: string }>;
}

export function redisRateLimit(options: { intervalSec: number; limit: number }): RedisLimiter {
  const { intervalSec, limit: defaultLimit } = options;
  return {
    async check(limit, token) {
      const effective = limit ?? defaultLimit;
      const window = Math.floor(Date.now() / 1000 / intervalSec);
      const key = `rl:${token}:${window}`;
      const reset = (window + 1) * intervalSec;

      const out = await pipeline([
        ["INCR", key],
        ["EXPIRE", key, String(intervalSec)],
      ]);

      const count = Number(out[0]?.result ?? 0);
      const remaining = Math.max(0, effective - count);

      if (count > effective) {
        throw new RateLimitError({ limit: effective, remaining: 0, reset });
      }
      return { limit: effective, remaining, reset };
    },
  };
}

/**
 * Drop-in factory: returns a Redis-backed limiter when Upstash is
 * configured, otherwise delegates to the in-memory factory provided by
 * the caller. Caller passes the in-memory factory to avoid a circular
 * import (this module is also imported from `lib/rate-limit.ts`).
 */
export function rateLimitAuto(
  options: {
    intervalMs: number;
    limit: number;
    uniqueTokenPerInterval?: number;
  },
  inMemoryFactory: (opts: {
    interval: number;
    limit: number;
    uniqueTokenPerInterval?: number;
  }) => RedisLimiter
): RedisLimiter {
  if (isRedisConfigured()) {
    return redisRateLimit({
      intervalSec: Math.ceil(options.intervalMs / 1000),
      limit: options.limit,
    });
  }
  return inMemoryFactory({
    interval: options.intervalMs,
    limit: options.limit,
    uniqueTokenPerInterval: options.uniqueTokenPerInterval,
  });
}
