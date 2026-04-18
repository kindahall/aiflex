/**
 * Client-side Sentry init (browser bundle) — Next 15 / Turbopack-compatible
 * replacement for the legacy `sentry.client.config.ts`. Runs once on page load.
 * Only activates when NEXT_PUBLIC_SENTRY_DSN is set, so local dev stays silent.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.5,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Network request failed",
      /Failed to fetch/,
    ],
  });
}

// Required by Next 15 convention — called on every client-side navigation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
