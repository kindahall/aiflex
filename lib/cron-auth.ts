import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Shared authentication for cron-triggered HTTP endpoints.
 *
 * Defense in depth:
 *   1. `x-cron-secret` header must match CRON_SECRET (timing-safe compare).
 *   2. Remote IP (from x-forwarded-for, falling back to req direct) must be
 *      in CRON_ALLOWED_IPS (comma-separated). MANDATORY in production unless
 *      CRON_ALLOWLIST_OPTIONAL=1 (explicit opt-out — use only when running
 *      behind a provider that already IP-restricts cron callers).
 *
 * Local dev skips the allowlist when it isn't configured.
 */

function isRuntimeProduction(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.AIFLEX_FORCE_PROD_GUARDS === "1") return true;
  return false;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function extractClientIp(req: Request): string | null {
  // Cron endpoints already require the caller to hold CRON_SECRET, which
  // is a much higher bar than a public endpoint. The IP allowlist is a
  // defense-in-depth layer on top of that secret, so it's fine to accept
  // the left-most XFF here as long as CRON_SECRET verification ran first.
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

  if (allowList.length === 0) {
    if (isRuntimeProduction() && process.env.CRON_ALLOWLIST_OPTIONAL !== "1") {
      return { ok: false, reason: "ip-not-allowed" };
    }
    return { ok: true };
  }

  const clientIp = extractClientIp(req);
  if (!clientIp || !allowList.includes(clientIp)) {
    return { ok: false, reason: "ip-not-allowed" };
  }

  return { ok: true };
}
