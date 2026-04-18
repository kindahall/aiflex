import "server-only";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job {
  id: string;
  type: string;
  userId: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  progress?: number; // 0-100
  attempts: number;
  maxRetries: number;
  nextRetryAt?: number;
}

export interface JobHandler {
  (job: Job, updateProgress: (pct: number) => void): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const jobs = new Map<string, Job>();
const handlers = new Map<string, JobHandler>();
let workerRunning = false;
let workerConcurrency = 2;
let activeCount = 0;

// Cleanup completed/failed jobs older than 1 hour
const CLEANUP_INTERVAL = 5 * 60 * 1000; // check every 5 min
const JOB_TTL = 60 * 60 * 1000; // 1 hour

function cleanup() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (
      (job.status === "completed" || job.status === "failed") &&
      job.completedAt &&
      now - job.completedAt > JOB_TTL
    ) {
      jobs.delete(id);
    }
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createJob(
  type: string,
  userId: string,
  payload: Record<string, unknown>,
  maxRetries = 3
): Job {
  const job: Job = {
    id: randomUUID(),
    type,
    userId,
    payload,
    status: "pending",
    createdAt: Date.now(),
    progress: 0,
    attempts: 0,
    maxRetries,
  };
  jobs.set(job.id, job);
  // Kick the worker loop if running
  if (workerRunning) {
    scheduleProcess();
  }
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function getJobsByUser(
  userId: string,
  filters?: { type?: string; status?: JobStatus }
): Job[] {
  const result: Job[] = [];
  for (const job of jobs.values()) {
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

async function processJob(job: Job): Promise<void> {
  const handler = handlers.get(job.type);
  if (!handler) {
    job.status = "failed";
    job.error = `No handler registered for job type "${job.type}"`;
    job.completedAt = Date.now();
    return;
  }

  job.status = "running";
  job.startedAt = Date.now();
  job.attempts += 1;

  try {
    const result = await handler(job, (pct: number) => {
      job.progress = Math.max(0, Math.min(100, pct));
    });
    job.status = "completed";
    job.result = result;
    job.progress = 100;
    job.completedAt = Date.now();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (job.attempts < job.maxRetries) {
      // Exponential backoff: 5s, 20s, 45s...
      const delaySec = 5 * Math.pow(job.attempts, 2);
      job.status = "pending";
      job.nextRetryAt = Date.now() + delaySec * 1000;
      job.error = `Attempt ${job.attempts} failed: ${msg}. Retrying in ${delaySec}s.`;
    } else {
      job.status = "failed";
      job.error = msg;
      job.completedAt = Date.now();
    }
  }
}

function getNextPendingJob(): Job | undefined {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status !== "pending") continue;
    if (job.nextRetryAt && now < job.nextRetryAt) continue;
    return job;
  }
  return undefined;
}

let processScheduled = false;

function scheduleProcess() {
  if (processScheduled) return;
  processScheduled = true;
  // Use setImmediate-like scheduling via setTimeout(0)
  setTimeout(() => {
    processScheduled = false;
    void processNext();
  }, 0);
}

async function processNext(): Promise<void> {
  while (activeCount < workerConcurrency) {
    const job = getNextPendingJob();
    if (!job) break;

    // Mark as running before awaiting so the next iteration doesn't pick it again
    job.status = "running";
    activeCount++;

    // Fire and forget — the job runs concurrently
    processJob(job).finally(() => {
      activeCount--;
      // Try to pick up more work
      if (workerRunning) {
        scheduleProcess();
      }
    });
  }
}

export function startWorker(concurrency = 2): void {
  if (workerRunning) return;
  workerRunning = true;
  workerConcurrency = concurrency;

  // Start cleanup interval
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL);
    // Don't keep the process alive just for cleanup
    if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
      cleanupTimer.unref();
    }
  }

  console.log(`[job-queue] Worker started (concurrency=${concurrency})`);

  // Check for any pending jobs that might already be queued
  scheduleProcess();

  // Also poll every 10 seconds for retry-eligible jobs
  const pollTimer = setInterval(() => {
    if (!workerRunning) {
      clearInterval(pollTimer);
      return;
    }
    scheduleProcess();
  }, 10_000);
  if (typeof pollTimer === "object" && "unref" in pollTimer) {
    pollTimer.unref();
  }
}

export function stopWorker(): void {
  workerRunning = false;
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
