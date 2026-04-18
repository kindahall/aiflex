import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as memory from "@/lib/job-queue-memory";
import * as queue from "@/lib/job-queue";

describe("job-queue facade (in-memory mode, REDIS_URL unset)", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    memory.__reset();
  });

  afterEach(() => {
    process.env.REDIS_URL = originalRedisUrl;
    memory.__reset();
  });

  it("createJob returns a pending Job synchronously", () => {
    const job = queue.createJob("test", "user_1", { foo: "bar" });
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("pending");
    expect(job.userId).toBe("user_1");
    expect(job.payload).toEqual({ foo: "bar" });
    expect(job.attempts).toBe(0);
    expect(job.maxRetries).toBe(3);
  });

  it("getJob retrieves by id", () => {
    const job = queue.createJob("test", "user_1", {});
    const found = queue.getJob(job.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(job.id);
  });

  it("getJob returns undefined for unknown id", () => {
    expect(queue.getJob("nonexistent")).toBeUndefined();
  });

  it("getJobsByUser filters by userId", () => {
    queue.createJob("t", "alice", {});
    queue.createJob("t", "alice", {});
    queue.createJob("t", "bob", {});
    expect(queue.getJobsByUser("alice")).toHaveLength(2);
    expect(queue.getJobsByUser("bob")).toHaveLength(1);
    expect(queue.getJobsByUser("unknown")).toHaveLength(0);
  });

  it("getJobsByUser filters by type", () => {
    queue.createJob("render", "alice", {});
    queue.createJob("upload", "alice", {});
    expect(queue.getJobsByUser("alice", { type: "render" })).toHaveLength(1);
    expect(queue.getJobsByUser("alice", { type: "upload" })).toHaveLength(1);
  });

  it("getJobsByUser filters by status", () => {
    queue.createJob("t", "alice", {});
    const j2 = queue.createJob("t", "alice", {});
    const mirror = memory.getJob(j2.id)!;
    mirror.status = "completed";
    mirror.completedAt = Date.now();
    expect(queue.getJobsByUser("alice", { status: "pending" })).toHaveLength(1);
    expect(queue.getJobsByUser("alice", { status: "completed" })).toHaveLength(
      1
    );
  });

  it("getJobsByUser sorts newest first", async () => {
    const a = queue.createJob("t", "alice", { n: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const b = queue.createJob("t", "alice", { n: 2 });
    const jobs = queue.getJobsByUser("alice");
    expect(jobs[0].id).toBe(b.id);
    expect(jobs[1].id).toBe(a.id);
  });

  it("registerHandler stores the handler in memory", async () => {
    let handled = false;
    queue.registerHandler("test", async () => {
      handled = true;
      return { ok: true };
    });
    memory.startWorker(1);
    queue.createJob("test", "u", {});
    // Give the worker a tick to pick it up
    await new Promise((r) => setTimeout(r, 50));
    expect(handled).toBe(true);
    memory.stopWorker();
  });

  it("exposes JobStatus type values that match the memory impl", () => {
    const statuses: queue.JobStatus[] = [
      "pending",
      "running",
      "completed",
      "failed",
    ];
    expect(statuses).toHaveLength(4);
  });
});
