/**
 * In-memory rate limiter using a sliding window algorithm.
 * Uses an LRU-like Map for token storage with automatic cleanup.
 * No external dependencies required.
 */

interface RateLimitOptions {
  interval: number; // Time window in milliseconds
  limit: number; // Max requests per interval
  uniqueTokenPerInterval?: number; // Max unique tokens to track (LRU cap)
}

interface RateLimitResult {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp (seconds) when the window resets
}

interface TokenRecord {
  timestamps: number[];
  createdAt: number;
}

interface RateLimiter {
  check(limit: number, token: string): Promise<RateLimitResult>;
}

export function rateLimit(options: RateLimitOptions): RateLimiter {
  const { interval, limit: defaultLimit, uniqueTokenPerInterval = 500 } = options;
  const tokenMap = new Map<string, TokenRecord>();

  // Periodic cleanup of expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of tokenMap) {
      // Remove entries where all timestamps are outside the window
      if (
        now - record.createdAt > interval &&
        record.timestamps.every((ts) => now - ts > interval)
      ) {
        tokenMap.delete(key);
      }
    }
  }, interval);

  // Allow the timer to not keep the process alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return {
    check(limit: number, token: string): Promise<RateLimitResult> {
      return new Promise((resolve, reject) => {
        const now = Date.now();
        const windowStart = now - interval;
        const resetTime = Math.ceil((now + interval) / 1000);

        let record = tokenMap.get(token);

        if (!record) {
          // Enforce LRU cap: evict the oldest entry if at capacity
          if (tokenMap.size >= uniqueTokenPerInterval) {
            const oldestKey = tokenMap.keys().next().value;
            if (oldestKey !== undefined) {
              tokenMap.delete(oldestKey);
            }
          }

          record = { timestamps: [], createdAt: now };
          tokenMap.set(token, record);
        } else {
          // Move to end of Map for LRU ordering
          tokenMap.delete(token);
          tokenMap.set(token, record);
        }

        // Sliding window: keep only timestamps within the current window
        record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

        const effectiveLimit = limit ?? defaultLimit;
        const currentCount = record.timestamps.length;
        const remaining = Math.max(0, effectiveLimit - currentCount - 1);

        if (currentCount >= effectiveLimit) {
          const result: RateLimitResult = {
            limit: effectiveLimit,
            remaining: 0,
            reset: resetTime,
          };

          const error = new RateLimitError(result);
          reject(error);
          return;
        }

        // Record this request
        record.timestamps.push(now);

        resolve({
          limit: effectiveLimit,
          remaining,
          reset: resetTime,
        });
      });
    },
  };
}

export class RateLimitError extends Error {
  public rateLimitResult: RateLimitResult;

  constructor(result: RateLimitResult) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.rateLimitResult = result;
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
//
// Each preset auto-switches to a Redis-backed counter when Upstash is
// configured — required for multi-instance deployments where in-memory
// counters would let an attacker bypass limits by hitting different pods.
import { rateLimitAuto } from "./rate-limit-redis";
const auto = (opts: { intervalMs: number; limit: number; uniqueTokenPerInterval?: number }) =>
  rateLimitAuto(opts, rateLimit);

/** General API routes: 60 requests per minute */
export const apiLimiter = auto({
  intervalMs: 60 * 1000,
  limit: 60,
  uniqueTokenPerInterval: 500,
});

/** Auth routes (login, register, password reset): 10 requests per minute */
export const authLimiter = auto({
  intervalMs: 60 * 1000,
  limit: 10,
  uniqueTokenPerInterval: 500,
});

/** Video generation: 5 requests per minute */
export const videoGenLimiter = auto({
  intervalMs: 60 * 1000,
  limit: 5,
  uniqueTokenPerInterval: 200,
});

/** File uploads: 20 requests per minute */
export const uploadLimiter = auto({
  intervalMs: 60 * 1000,
  limit: 20,
  uniqueTokenPerInterval: 300,
});

/** Generation agent: 5 starts per hour (V8 §19.8) */
export const agentStartLimiter = auto({
  intervalMs: 60 * 60 * 1000,
  limit: 5,
  uniqueTokenPerInterval: 500,
});

/** Sequel creation: 2 per hour (V8 §19.8) */
export const sequelLimiter = auto({
  intervalMs: 60 * 60 * 1000,
  limit: 2,
  uniqueTokenPerInterval: 500,
});

/** Signup: 3 per hour per IP (V8 §19.8) */
export const signupLimiter = auto({
  intervalMs: 60 * 60 * 1000,
  limit: 3,
  uniqueTokenPerInterval: 500,
});

/** Comments: 20 per hour (V8 §19.8) */
export const commentLimiter = auto({
  intervalMs: 60 * 60 * 1000,
  limit: 20,
  uniqueTokenPerInterval: 1000,
});

/** DMCA / reports: 5 per hour per IP (anti-abuse of signalement system) */
export const reportLimiter = auto({
  intervalMs: 60 * 60 * 1000,
  limit: 5,
  uniqueTokenPerInterval: 500,
});

// ---------------------------------------------------------------------------
// Per-user rate limit helpers (V8 §19.8)
// ---------------------------------------------------------------------------

/**
 * Per-user rate check, used INSIDE route handlers (not in middleware) since
 * the user id isn't available at the Edge. Throws RateLimitError when the
 * cap is hit — the caller catches it and returns 429.
 *
 *   await checkPerUser(sequelLimiter, 2, user.id, "sequel");
 *
 * The token is `<scope>:<userId>` so multiple per-user limits coexist
 * without crosstalk.
 */
export async function checkPerUser(
  limiter: RateLimiter,
  limit: number,
  userId: string,
  scope: string
): Promise<RateLimitResult> {
  return limiter.check(limit, `${scope}:${userId}`);
}

/**
 * Daily rate check (24h window) — uses the same sliding-window store but
 * with a fresh limiter instance per scope. Useful for "max 10 sequels per
 * day on a parent film" type rules.
 */
const dailyLimiters = new Map<string, RateLimiter>();

export async function checkPerScope(
  scope: string,
  intervalMs: number,
  limit: number,
  token: string
): Promise<RateLimitResult> {
  const key = `${scope}:${intervalMs}:${limit}`;
  let limiter = dailyLimiters.get(key);
  if (!limiter) {
    limiter = rateLimit({ interval: intervalMs, limit, uniqueTokenPerInterval: 5000 });
    dailyLimiters.set(key, limiter);
  }
  return limiter.check(limit, token);
}

// Re-export the RateLimiter shape so route handlers can typecheck the helper.
export type { RateLimiter, RateLimitResult };
