import "server-only";

/**
 * Facade over the in-memory and Redis/BullMQ job queue backends.
 *
 * Selection rule: when `REDIS_URL` is set AND `bullmq` + `ioredis` are
 * resolvable, we use the Redis backend (persistent, survives restarts).
 * Otherwise we fall back to the in-memory backend.
 *
 * All callers import from this file; the concrete impl is an internal detail.
 */

import * as memory from "./job-queue-memory";
import type { Job, JobHandler, JobStatus } from "./job-queue-memory";

export type { Job, JobHandler, JobStatus };

const USE_REDIS = Boolean(process.env.REDIS_URL);

// Lazy-loaded Redis adapter so dev/test environments without Redis aren't
// forced to resolve bullmq at module-load.
type RedisAdapter = typeof import("./job-queue-redis");
let redisAdapterPromise: Promise<RedisAdapter | null> | null = null;

async function getRedisAdapter(): Promise<RedisAdapter | null> {
  if (!USE_REDIS) return null;
  if (!redisAdapterPromise) {
    redisAdapterPromise = import("./job-queue-redis").catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        "[job-queue] REDIS_URL is set but bullmq/ioredis failed to load — " +
          "falling back to in-memory queue. Error:",
        err
      );
      return null;
    });
  }
  return redisAdapterPromise;
}

/**
 * Create a job. Returns synchronously with an in-memory mirror Job. When
 * REDIS_URL is set, the enqueue is also dispatched to BullMQ in the
 * background — callers poll via getJob(id) which reads the mirror.
 */
export function createJob(
  type: string,
  userId: string,
  payload: Record<string, unknown>,
  maxRetries = 3
): Job {
  const job = memory.createJob(type, userId, payload, maxRetries);

  if (USE_REDIS) {
    void (async () => {
      const adapter = await getRedisAdapter();
      if (!adapter) return;
      try {
        await adapter.createJob(type, userId, payload, maxRetries);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[job-queue] Redis enqueue failed:", err);
      }
    })();
  }

  return job;
}

export function getJob(id: string): Job | undefined {
  return memory.getJob(id);
}

export function getJobsByUser(
  userId: string,
  filters?: { type?: string; status?: JobStatus }
): Job[] {
  return memory.getJobsByUser(userId, filters);
}

export function registerHandler(type: string, handler: JobHandler): void {
  memory.registerHandler(type, handler);
  if (USE_REDIS) {
    void (async () => {
      const adapter = await getRedisAdapter();
      adapter?.registerHandler(type, handler);
    })();
  }
}

export function startWorker(concurrency = 2): void {
  memory.startWorker(concurrency);
  if (USE_REDIS) {
    void (async () => {
      const adapter = await getRedisAdapter();
      await adapter?.startWorker(concurrency);
    })();
  }
}

export async function stopWorker(): Promise<void> {
  memory.stopWorker();
  if (USE_REDIS) {
    const adapter = await getRedisAdapter();
    await adapter?.stopWorker();
  }
}
