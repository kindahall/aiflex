import "server-only";
import { randomUUID } from "node:crypto";
import type { Job, JobHandler, JobStatus } from "./job-queue-memory";

/**
 * BullMQ-backed job queue. Only activates when REDIS_URL is set (see facade
 * in lib/job-queue.ts). Imports `bullmq` + `ioredis` lazily so dev/test
 * environments without Redis still boot.
 *
 * Design notes:
 *   - The Redis adapter matches the in-memory API surface 1:1. Callers never
 *     know which backend they're on.
 *   - We keep a per-process `Map<string, Job>` mirror so `getJob` can return
 *     synchronously; BullMQ's `Queue.getJob` is async. The mirror is updated
 *     in the worker's lifecycle callbacks.
 *   - A single queue name "aiflex-jobs" fan-outs by `type` inside the job
 *     payload, matching the in-memory dispatcher semantics.
 */

const QUEUE_NAME = "aiflex-jobs";

type BullMQModule = typeof import("bullmq");
type IORedisModule = typeof import("ioredis");

let bullmq: BullMQModule | null = null;
let ioredis: IORedisModule | null = null;
let queue: import("bullmq").Queue | null = null;
let worker: import("bullmq").Worker | null = null;
let connection: import("ioredis").Redis | null = null;

const handlers = new Map<string, JobHandler>();
const jobMirror = new Map<string, Job>();
let workerRunning = false;

async function loadDeps(): Promise<boolean> {
  if (!bullmq) {
    bullmq = await import("bullmq").catch(() => null);
    if (!bullmq) return false;
  }
  if (!ioredis) {
    const mod = (await import("ioredis").catch(() => null)) as unknown as
      | IORedisModule
      | null;
    if (!mod) return false;
    ioredis = mod;
  }
  return true;
}

async function getQueue(): Promise<import("bullmq").Queue | null> {
  if (queue) return queue;
  const ok = await loadDeps();
  if (!ok) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const RedisCtor =
    (ioredis as unknown as { default?: IORedisModule["default"] }).default ??
    (ioredis as unknown as IORedisModule["default"]);
  connection = new RedisCtor(url, { maxRetriesPerRequest: null });
  queue = new bullmq!.Queue(QUEUE_NAME, { connection });
  return queue;
}

// ---------------------------------------------------------------------------
// Public API — mirrors lib/job-queue-memory.ts
// ---------------------------------------------------------------------------

export async function createJob(
  type: string,
  userId: string,
  payload: Record<string, unknown>,
  maxRetries = 3
): Promise<Job> {
  const jobId = randomUUID();
  const now = Date.now();
  const job: Job = {
    id: jobId,
    type,
    userId,
    payload,
    status: "pending",
    createdAt: now,
    progress: 0,
    attempts: 0,
    maxRetries,
  };
  jobMirror.set(jobId, job);

  const q = await getQueue();
  if (!q) {
    // Dependencies missing at runtime — mark as failed rather than silently
    // drop. The facade should have routed to the in-memory impl in this case.
    job.status = "failed";
    job.error = "bullmq/ioredis unavailable";
    job.completedAt = now;
    return job;
  }

  await q.add(
    type,
    { jobId, userId, payload },
    {
      jobId,
      attempts: maxRetries,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    }
  );
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobMirror.get(id);
}

export function getJobsByUser(
  userId: string,
  filters?: { type?: string; status?: JobStatus }
): Job[] {
  const result: Job[] = [];
  for (const job of jobMirror.values()) {
    if (job.userId !== userId) continue;
    if (filters?.type && job.type !== filters.type) continue;
    if (filters?.status && job.status !== filters.status) continue;
    result.push(job);
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function registerHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export async function startWorker(concurrency = 2): Promise<void> {
  if (workerRunning) return;
  const ok = await loadDeps();
  if (!ok) return;
  const url = process.env.REDIS_URL;
  if (!url) return;

  const RedisCtor =
    (ioredis as unknown as { default?: IORedisModule["default"] }).default ??
    (ioredis as unknown as IORedisModule["default"]);
  const workerConnection = new RedisCtor(url, { maxRetriesPerRequest: null });

  worker = new bullmq!.Worker(
    QUEUE_NAME,
    async (bullJob) => {
      const mirror = jobMirror.get(bullJob.id as string);
      const handler = handlers.get(bullJob.name);
      if (!handler) {
        throw new Error(`No handler registered for job type "${bullJob.name}"`);
      }
      if (mirror) {
        mirror.status = "running";
        mirror.startedAt = Date.now();
        mirror.attempts = (bullJob.attemptsMade || 0) + 1;
      }
      const result = await handler(
        mirror ?? {
          id: bullJob.id as string,
          type: bullJob.name,
          userId: (bullJob.data as { userId?: string }).userId || "",
          payload: (bullJob.data as { payload?: Record<string, unknown> }).payload || {},
          status: "running",
          createdAt: Date.now(),
          attempts: (bullJob.attemptsMade || 0) + 1,
          maxRetries: bullJob.opts?.attempts || 3,
        },
        (pct: number) => {
          if (mirror) mirror.progress = Math.max(0, Math.min(100, pct));
          void bullJob.updateProgress(pct);
        }
      );
      if (mirror) {
        mirror.status = "completed";
        mirror.progress = 100;
        mirror.result = result;
        mirror.completedAt = Date.now();
      }
      return result;
    },
    { connection: workerConnection, concurrency }
  );

  worker.on("failed", (bullJob, err) => {
    const mirror = jobMirror.get(bullJob?.id as string);
    if (!mirror) return;
    const last =
      (bullJob?.attemptsMade || 0) >= (bullJob?.opts?.attempts || 1);
    if (last) {
      mirror.status = "failed";
      mirror.error = err.message;
      mirror.completedAt = Date.now();
    } else {
      mirror.status = "pending";
      mirror.error = `Attempt ${bullJob?.attemptsMade} failed: ${err.message}`;
    }
  });

  workerRunning = true;
  // eslint-disable-next-line no-console
  console.log(`[job-queue:redis] Worker started (concurrency=${concurrency})`);
}

export async function stopWorker(): Promise<void> {
  workerRunning = false;
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    connection.disconnect();
    connection = null;
  }
}

export function __reset() {
  jobMirror.clear();
  handlers.clear();
  workerRunning = false;
}
