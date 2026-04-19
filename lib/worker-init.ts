import "server-only";
import { startWorker, stopWorker } from "./job-queue";
import { registerVideoGenerationHandler } from "./jobs/video-generation";

let initialized = false;
let shutdownRegistered = false;

/**
 * Register all job handlers and start the background worker.
 * Safe to call multiple times — only initializes once.
 */
export function initWorker(): void {
  if (initialized) return;
  initialized = true;

  // Register handlers
  registerVideoGenerationHandler();

  // Start the worker with configured concurrency
  const concurrency = parseInt(process.env.JOB_CONCURRENCY || "2", 10);
  startWorker(concurrency);

  registerGracefulShutdown();
}

/**
 * Hook SIGTERM / SIGINT so in-flight BullMQ jobs get a chance to finish
 * before the pod dies. Without this, rolling deploys kill generation
 * jobs mid-stream and the user sees a stuck project with no error log.
 * Configurable via WORKER_SHUTDOWN_TIMEOUT_MS (default 25s — under most
 * platforms' 30s grace window).
 */
function registerGracefulShutdown(): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  let shuttingDown = false;
  const timeoutMs = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || 25_000);

  const handle = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.info(`[worker] received ${signal} — draining queue (max ${timeoutMs}ms)`);

    const deadline = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    Promise.race([stopWorker(), deadline])
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[worker] stop failed:", err);
      })
      .finally(() => {
        process.exit(0);
      });
  };

  process.once("SIGTERM", handle);
  process.once("SIGINT", handle);
}
