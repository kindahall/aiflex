import "server-only";

/**
 * Per-user TOTP lockout. In-memory store — good enough for a single-node
 * deployment; for multi-node, move to Redis (same interface: Map-like
 * get/set with TTL). We count consecutive failures and refuse further
 * attempts past LOCKOUT_THRESHOLD for LOCKOUT_MS.
 *
 * Why per-user and not per-IP: with X-Forwarded-For spoofing neutralised
 * in lib/client-ip.ts, per-IP lockout is safer than before — but a
 * distributed botnet still works around it. Per-user is the only real
 * brute-force defense for TOTP (6 digits = 1M space).
 */

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const IP_LOCKOUT_THRESHOLD = 15;
const IP_LOCKOUT_MS = 30 * 60 * 1000;

interface FailureState {
  count: number;
  firstFailAt: number;
  lockedUntil?: number;
}

const failures = new Map<string, FailureState>();
const ipFailures = new Map<string, FailureState>();

function readLock(store: Map<string, FailureState>, key: string): number {
  const now = Date.now();
  const s = store.get(key);
  if (!s) return 0;
  if (s.lockedUntil && s.lockedUntil > now) return s.lockedUntil - now;
  if (s.lockedUntil && s.lockedUntil <= now) {
    store.delete(key);
  }
  return 0;
}

function recordFailure(
  store: Map<string, FailureState>,
  key: string,
  threshold: number,
  lockoutMs: number
): void {
  const now = Date.now();
  const s = store.get(key) || { count: 0, firstFailAt: now };
  s.count += 1;
  if (s.count >= threshold) {
    s.lockedUntil = now + lockoutMs;
  }
  store.set(key, s);
}

export function isTotpLocked(userId: string): number {
  return readLock(failures, userId);
}

export function recordFailedTotp(userId: string): void {
  recordFailure(failures, userId, LOCKOUT_THRESHOLD, LOCKOUT_MS);
}

export function resetTotpFailures(userId: string): void {
  failures.delete(userId);
}

/**
 * Separate IP-scoped cooldown — defense against a botnet trying many
 * userIds from the same source once the per-user lock stays unhit.
 * Thresholds are intentionally looser than the per-user ones so
 * legitimate shared NATs don't trip them.
 */
export function isTotpLockedByIp(ip: string): number {
  if (!ip || ip === "anonymous") return 0;
  return readLock(ipFailures, ip);
}

export function recordFailedTotpByIp(ip: string): void {
  if (!ip || ip === "anonymous") return;
  recordFailure(ipFailures, ip, IP_LOCKOUT_THRESHOLD, IP_LOCKOUT_MS);
}

export function resetTotpFailuresByIp(ip: string): void {
  if (!ip || ip === "anonymous") return;
  ipFailures.delete(ip);
}
