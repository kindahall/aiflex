/**
 * Next.js instrumentation hook — runs once when the server starts.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Sentry Node/Server runtime
    await import("./sentry.server.config");
    const { initWorker } = await import("./lib/worker-init");
    initWorker();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next 15 expects the hook to be named `onRequestError`. Sentry ships its
// implementation as `captureRequestError` — re-export under the correct name.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
