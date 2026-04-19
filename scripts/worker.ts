/**
 * worker.ts — standalone job-queue consumer.
 *
 * Run as a separate process from the Next.js web tier so that:
 *   - long-running video generation can't starve HTTP request handling
 *   - the worker can be scaled (or paused) independently
 *   - a worker OOM doesn't take the web app down with it
 *
 * Production:
 *   AIFLEX_ROLE=worker tsx scripts/worker.ts
 *
 * Docker:
 *   web pod    → CMD ["next", "start"]      with AIFLEX_ROLE=web
 *   worker pod → CMD ["tsx", "scripts/worker.ts"] with AIFLEX_ROLE=worker
 *
 * Local dev: not needed — `next dev` runs both via instrumentation.ts
 * (AIFLEX_ROLE defaults to "all").
 */

import { assertProductionEnv } from "@/lib/env";
import { initWorker } from "@/lib/worker-init";
import { log } from "@/lib/logger";

async function main(): Promise<void> {
  // Same boot guards as the web tier — we want fail-fast on missing
  // secrets here too.
  assertProductionEnv();

  log.info("worker.boot", {
    role: process.env.AIFLEX_ROLE || "worker",
    concurrency: Number(process.env.JOB_CONCURRENCY || 2),
    pid: process.pid,
  });

  initWorker();

  // Graceful shutdown — let in-flight jobs finish, then exit.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("worker.shutdown", { signal });
    try {
      const { stopWorker } = await import("@/lib/job-queue");
      if (typeof stopWorker === "function") {
        await stopWorker();
      }
    } catch (err) {
      log.warn("worker.shutdown stopWorker failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    setTimeout(() => process.exit(0), 500).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Heartbeat so the operator's process supervisor (systemd, k8s probe)
  // can detect a hung worker.
  const heartbeatMs = Number(process.env.WORKER_HEARTBEAT_MS || 60_000);
  setInterval(() => {
    log.debug("worker.heartbeat", {
      uptimeSec: Math.floor(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  }, heartbeatMs).unref();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal", err);
  process.exit(1);
});
