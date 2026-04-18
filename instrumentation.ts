/**
 * Next.js instrumentation hook — runs once when the server starts.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server runtime, not during build or in the edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initWorker } = await import("./lib/worker-init");
    initWorker();
  }
}
