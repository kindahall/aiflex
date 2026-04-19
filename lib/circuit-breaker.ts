import "server-only";

/**
 * In-process circuit breaker for outbound provider calls.
 *
 * States:
 *   - CLOSED  → calls flow normally; failures are tallied
 *   - OPEN    → calls short-circuit (throw immediately) for `cooldownMs`
 *   - HALF_OPEN → first call after cooldown is allowed as a probe;
 *                 success closes the breaker, failure re-opens it
 *
 * Why: a misbehaving upstream (Suno hung, fal.ai 502 storm, Anthropic
 * rate-limit at 100% errors) makes us pile up retries that drain
 * resources and amplify the outage. A breaker bounded by recent failure
 * rate gives the dependency time to recover.
 *
 * Pair with `withOutboundLimit` (concurrency) and `timedFetch` (per-call
 * timeout) — three knobs that together neutralize most upstream
 * pathologies.
 */

interface BreakerState {
  failures: number;
  successesInHalfOpen: number;
  windowStart: number;
  openedAt?: number;
  state: "closed" | "open" | "half-open";
}

interface BreakerConfig {
  failureThreshold: number; // failures inside windowMs before opening
  windowMs: number;
  cooldownMs: number;
  halfOpenSuccessTarget: number; // consecutive successes needed to close
}

const DEFAULTS: BreakerConfig = {
  failureThreshold: 8,
  windowMs: 60_000,
  cooldownMs: 30_000,
  halfOpenSuccessTarget: 2,
};

const breakers = new Map<string, BreakerState>();

function readConfig(name: string): BreakerConfig {
  const env = (k: string) => process.env[`BREAKER_${name.toUpperCase()}_${k}`];
  return {
    failureThreshold: Number(env("THRESHOLD")) || DEFAULTS.failureThreshold,
    windowMs: Number(env("WINDOW_MS")) || DEFAULTS.windowMs,
    cooldownMs: Number(env("COOLDOWN_MS")) || DEFAULTS.cooldownMs,
    halfOpenSuccessTarget: Number(env("HALF_OPEN_SUCCESSES")) || DEFAULTS.halfOpenSuccessTarget,
  };
}

function getState(name: string): BreakerState {
  let s = breakers.get(name);
  if (!s) {
    s = {
      failures: 0,
      successesInHalfOpen: 0,
      windowStart: Date.now(),
      state: "closed",
    };
    breakers.set(name, s);
  }
  return s;
}

export class CircuitOpenError extends Error {
  constructor(
    public name: string,
    public retryAfterMs: number
  ) {
    super(`Circuit "${name}" ouvert — réessaye dans ${Math.ceil(retryAfterMs / 1000)}s`);
  }
}

export async function withCircuitBreaker<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const cfg = readConfig(name);
  const s = getState(name);
  const now = Date.now();

  // Roll the failure window if expired.
  if (now - s.windowStart > cfg.windowMs) {
    s.windowStart = now;
    s.failures = 0;
  }

  if (s.state === "open") {
    const elapsed = now - (s.openedAt ?? 0);
    if (elapsed < cfg.cooldownMs) {
      throw new CircuitOpenError(name, cfg.cooldownMs - elapsed);
    }
    s.state = "half-open";
    s.successesInHalfOpen = 0;
  }

  try {
    const out = await fn();
    if (s.state === "half-open") {
      s.successesInHalfOpen += 1;
      if (s.successesInHalfOpen >= cfg.halfOpenSuccessTarget) {
        s.state = "closed";
        s.failures = 0;
      }
    } else {
      // CLOSED: reset slow-leaking failures on a clean success.
      s.failures = Math.max(0, s.failures - 1);
    }
    return out;
  } catch (err) {
    if (s.state === "half-open") {
      // Probe failed → re-open.
      s.state = "open";
      s.openedAt = now;
      s.successesInHalfOpen = 0;
    } else {
      s.failures += 1;
      if (s.failures >= cfg.failureThreshold) {
        s.state = "open";
        s.openedAt = now;
      }
    }
    throw err;
  }
}

/** Test-only helper. */
export function _resetCircuitBreakers(): void {
  breakers.clear();
}
