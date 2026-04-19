import "server-only";

/**
 * Per-subject failure lockout for password-based auth flows.
 *
 * Scope: login (credential stuffing), change-password (session-stealing
 * attacker probing), password-reset-token replay. In-memory store — good
 * for a single-node deployment. Move to Redis when you scale out.
 *
 * Why per-subject and not per-IP: with X-Forwarded-For neutralised
 * (see lib/client-ip.ts) per-IP is safer, but a distributed botnet still
 * slips through. Locking the *account* raises the cost.
 */

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

interface State {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const buckets = new Map<string, State>();

function k(scope: string, subject: string): string {
  return `${scope}:${subject.toLowerCase()}`;
}

export function isLocked(scope: string, subject: string): number {
  const now = Date.now();
  const key = k(scope, subject);
  const s = buckets.get(key);
  if (!s) return 0;
  if (s.lockedUntil && s.lockedUntil > now) return s.lockedUntil - now;
  if (s.lockedUntil && s.lockedUntil <= now) {
    buckets.delete(key);
    return 0;
  }
  // Window expired → reset silently.
  if (now - s.firstAttemptAt > WINDOW_MS) {
    buckets.delete(key);
    return 0;
  }
  return 0;
}

export function recordFailure(scope: string, subject: string): void {
  const now = Date.now();
  const key = k(scope, subject);
  const s = buckets.get(key);
  if (!s || now - s.firstAttemptAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAttemptAt: now });
    return;
  }
  s.count += 1;
  if (s.count >= MAX_ATTEMPTS) {
    s.lockedUntil = now + LOCKOUT_MS;
  }
  buckets.set(key, s);
}

export function resetFailures(scope: string, subject: string): void {
  buckets.delete(k(scope, subject));
}
