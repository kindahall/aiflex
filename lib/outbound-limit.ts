import "server-only";

/**
 * Per-provider outbound concurrency + rate limits. A runaway generation
 * bug (or a malicious prompt that triggers retries) can otherwise
 * explode the plateform's monthly AI bill in minutes.
 *
 * Two knobs:
 *   - concurrency: how many in-flight calls at once
 *   - ratePerMinute: soft ceiling, enforced by queuing
 *
 * Defaults are conservative; raise them via env once you have monitoring
 * in place (Sentry, Grafana) to measure per-provider cost ceilings.
 */

interface Slot {
  concurrent: number;
  windowStart: number;
  windowCount: number;
  waitQueue: Array<() => void>;
}

interface Config {
  concurrency: number;
  ratePerMinute: number;
}

const slots = new Map<string, Slot>();
const configs: Record<string, Config> = {
  fal: { concurrency: 8, ratePerMinute: 120 },
  anthropic: { concurrency: 16, ratePerMinute: 600 },
  openai: { concurrency: 16, ratePerMinute: 600 },
  elevenlabs: { concurrency: 4, ratePerMinute: 60 },
  syncLabs: { concurrency: 2, ratePerMinute: 20 },
  suno: { concurrency: 2, ratePerMinute: 20 },
  stripe: { concurrency: 32, ratePerMinute: 600 },
  yoti: { concurrency: 4, ratePerMinute: 30 },
  generic: { concurrency: 32, ratePerMinute: 600 },
};

function readConfig(provider: string): Config {
  const base = configs[provider] || configs.generic;
  const cEnv = process.env[`OUTBOUND_${provider.toUpperCase()}_CONCURRENCY`];
  const rEnv = process.env[`OUTBOUND_${provider.toUpperCase()}_RPM`];
  return {
    concurrency: cEnv ? Math.max(1, Number(cEnv)) : base.concurrency,
    ratePerMinute: rEnv ? Math.max(1, Number(rEnv)) : base.ratePerMinute,
  };
}

function getSlot(provider: string): Slot {
  let s = slots.get(provider);
  if (!s) {
    s = { concurrent: 0, windowStart: Date.now(), windowCount: 0, waitQueue: [] };
    slots.set(provider, s);
  }
  return s;
}

async function acquire(provider: string): Promise<void> {
  const cfg = readConfig(provider);
  const slot = getSlot(provider);

  // Rolling 60s window accounting
  const now = Date.now();
  if (now - slot.windowStart >= 60_000) {
    slot.windowStart = now;
    slot.windowCount = 0;
  }

  while (slot.concurrent >= cfg.concurrency || slot.windowCount >= cfg.ratePerMinute) {
    await new Promise<void>((resolve) => slot.waitQueue.push(resolve));
    const t = Date.now();
    if (t - slot.windowStart >= 60_000) {
      slot.windowStart = t;
      slot.windowCount = 0;
    }
  }
  slot.concurrent += 1;
  slot.windowCount += 1;
}

function release(provider: string): void {
  const slot = getSlot(provider);
  slot.concurrent = Math.max(0, slot.concurrent - 1);
  const next = slot.waitQueue.shift();
  if (next) next();
}

export async function withOutboundLimit<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  await acquire(provider);
  try {
    return await fn();
  } finally {
    release(provider);
  }
}
