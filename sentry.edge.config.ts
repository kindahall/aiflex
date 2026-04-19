/**
 * Edge runtime Sentry init (middleware.ts, edge routes).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9_.\-~+/=]{10,}/gi,
  /sk_live_[A-Za-z0-9]{10,}/g,
  /sk_test_[A-Za-z0-9]{10,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /fal_[A-Za-z0-9]{20,}/g,
];

function scrubString(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

function scrub<T>(value: T, depth = 0): T {
  if (depth > 6) return value;
  if (typeof value === "string") return scrubString(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((v) => scrub(v, depth + 1)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (/^(authorization|cookie|x-api-key|x-proxy-secret)$/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = scrub(v, depth + 1);
      }
    }
    return out as unknown as T;
  }
  return value;
}

function parseSampleRate(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV,
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    sampleRate: parseSampleRate(process.env.SENTRY_ERROR_SAMPLE_RATE, 1.0),
    sendDefaultPii: false,
    beforeSend(event) {
      return scrub(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrub(breadcrumb);
    },
  });
}
