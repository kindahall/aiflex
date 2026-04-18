import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Shared authentication for cron-triggered HTTP endpoints.
 *
 * Defense in depth:
 *   1. `x-cron-secret` header must match CRON_SECRET (timing-safe compare).
 *   2. Remote IP (from x-forwarded-for, falling back to req direct) must be
 *      in CRON_ALLOWED_IPS (comma-separated) when that env var is set.
 *
 * If CRON_ALLOWED_IPS is unset we degrade to secret-only — fine for local
 * dev but prod MUST set it.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function extractClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export interface CronAuthResult {
  ok: boolean;
  reason?: "no-secret-configured" | "bad-secret" | "ip-not-allowed";
}

export function verifyCronRequest(req: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return { ok: false, reason: "no-secret-configured" };

  const provided = req.headers.get("x-cron-secret") || "";
  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, reason: "bad-secret" };
  }

  const allowList = (process.env.CRON_ALLOWED_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowList.length > 0) {
    const clientIp = extractClientIp(req);
    if (!clientIp || !allowList.includes(clientIp)) {
      return { ok: false, reason: "ip-not-allowed" };
    }
  }

  return { ok: true };
}
