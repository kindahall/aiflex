/**
 * Client-side Sentry init (browser bundle).
 * Only activates when NEXT_PUBLIC_SENTRY_DSN is set, so local dev stays silent.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,
    // Keep sample rates conservative until we know the volume.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.5,
    // Don't spam the Sentry project with noisy ResizeObserver / network errors.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Network request failed",
      /Failed to fetch/,
    ],
  });
}
