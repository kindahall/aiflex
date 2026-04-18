import "server-only";
import { startWorker } from "./job-queue";
import { registerVideoGenerationHandler } from "./jobs/video-generation";

let initialized = false;

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
}
