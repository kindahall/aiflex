/**
 * Next.js instrumentation hook — runs once when the server starts.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate critical env vars before anything else — fail-fast if a
    // prod deployment is missing a required secret.
    const { assertProductionEnv } = await import("./lib/env");
    assertProductionEnv();

    // Sentry Node/Server runtime
    await import("./sentry.server.config");

    // Worker boot is gated by AIFLEX_ROLE so the same image can be
    // deployed as either web (HTTP serving only) or worker (queue
    // consumer only) — or "all" for single-instance dev/VPS setups.
    //   web    → no worker, just HTTP
    //   worker → no HTTP listener (handled by separate scripts/worker.ts)
    //   all    → both (default, dev-friendly)
    const role = (process.env.AIFLEX_ROLE || "all").toLowerCase();
    if (role === "all" || role === "web") {
      // Web pods spawn the worker only when explicitly told to via
      // AIFLEX_WEB_RUNS_WORKER=1 — discourages the "single big monolith"
      // pattern that couples request CPU to generation CPU.
      if (role === "all" || process.env.AIFLEX_WEB_RUNS_WORKER === "1") {
        const { initWorker } = await import("./lib/worker-init");
        initWorker();
      }
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next 15 expects the hook to be named `onRequestError`. Sentry ships its
// implementation as `captureRequestError` — re-export under the correct name.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
