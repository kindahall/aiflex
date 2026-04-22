/**
 * Integration-ish test for the Dolby.io webhook route handler. We mock
 * the DB adapter so this stays a unit test (no Postgres needed), but we
 * exercise the real POST handler end-to-end: signature check, payload
 * parse, status normalisation, and the DolbyIOJob update.
 *
 * This catches:
 *   - Missing / malformed Dolby-Signature header
 *   - Payload body mutations (tamper check at the route level)
 *   - Status-to-enum normalisation ("Succeeded" vs "succeeded", etc.)
 *   - Unknown job_id → 200 no-op (prevents Dolby retry storms)
 */

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dolbyio-jobs", () => {
  const store = new Map<string, any>();
  return {
    __store: store,
    findDolbyIoJobByJobId: vi.fn(async (jobId: string) => store.get(jobId) ?? null),
    updateDolbyIoJobStatus: vi.fn(async (jobId: string, patch: any) => {
      const row = store.get(jobId);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    }),
  };
});

vi.mock("@/lib/jobs/atmos-download", () => ({
  enqueueAtmosDownload: vi.fn(async () => {}),
}));

vi.mock("@/lib/observability", () => ({
  captureError: vi.fn(async () => {}),
}));

import { POST } from "@/app/api/webhooks/dolbyio/route";
import * as jobs from "@/lib/dolbyio-jobs";
import * as atmosDownload from "@/lib/jobs/atmos-download";

const store = (jobs as unknown as { __store: Map<string, any> }).__store;

const SECRET = "test-secret-256-bit-hex-equivalent-string-for-hmac";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function mkReq(body: string, sig: string | null): Request {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (sig !== null) headers.set("dolby-signature", sig);
  return new Request("http://localhost/api/webhooks/dolbyio", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/webhooks/dolbyio", () => {
  const originalSecret = process.env.DOLBY_IO_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.DOLBY_IO_WEBHOOK_SECRET = SECRET;
    store.clear();
    store.set("existing-job-1", {
      id: "row-1",
      jobId: "existing-job-1",
      projectId: "proj-1",
      ownerId: "user-1",
      status: "pending",
    });
    vi.mocked(jobs.updateDolbyIoJobStatus).mockClear();
    vi.mocked(atmosDownload.enqueueAtmosDownload).mockClear();
  });

  afterEach();

  it("503 when DOLBY_IO_WEBHOOK_SECRET is absent", async () => {
    delete process.env.DOLBY_IO_WEBHOOK_SECRET;
    const body = JSON.stringify({ job_id: "x", status: "Succeeded" });
    const res = await POST(mkReq(body, sign(body)) as any);
    expect(res.status).toBe(503);
  });

  it("401 when Dolby-Signature header is missing", async () => {
    const body = JSON.stringify({ job_id: "x" });
    const res = await POST(mkReq(body, null) as any);
    expect(res.status).toBe(401);
  });

  it("401 when the signature is wrong", async () => {
    const body = JSON.stringify({ job_id: "existing-job-1", status: "Succeeded" });
    const res = await POST(mkReq(body, "bad-sig") as any);
    expect(res.status).toBe(401);
  });

  it("200 + updates row + enqueues download when status=Succeeded", async () => {
    const body = JSON.stringify({
      job_id: "existing-job-1",
      status: "Succeeded",
      result_url: "https://dolby.example/out.mp4",
    });
    const res = await POST(mkReq(body, sign(body)) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
    expect(data.known).toBe(true);
    expect(data.status).toBe("succeeded");
    expect(jobs.updateDolbyIoJobStatus).toHaveBeenCalledWith(
      "existing-job-1",
      expect.objectContaining({
        status: "succeeded",
        resultUrl: "https://dolby.example/out.mp4",
      })
    );
    expect(atmosDownload.enqueueAtmosDownload).toHaveBeenCalledWith({
      jobId: "existing-job-1",
      projectId: "proj-1",
    });
  });

  it("does NOT enqueue a download when status=Failed (error flows)", async () => {
    const body = JSON.stringify({
      job_id: "existing-job-1",
      status: "Failed",
      error: { message: "encoder rejected input" },
    });
    const res = await POST(mkReq(body, sign(body)) as any);
    expect(res.status).toBe(200);
    expect(atmosDownload.enqueueAtmosDownload).not.toHaveBeenCalled();
    expect(jobs.updateDolbyIoJobStatus).toHaveBeenCalledWith(
      "existing-job-1",
      expect.objectContaining({
        status: "failed",
        errorText: expect.stringContaining("encoder rejected input"),
      })
    );
  });

  it("200 + known=false for an unknown jobId (no retry storm)", async () => {
    const body = JSON.stringify({ job_id: "ghost", status: "Succeeded" });
    const res = await POST(mkReq(body, sign(body)) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.known).toBe(false);
    expect(atmosDownload.enqueueAtmosDownload).not.toHaveBeenCalled();
  });

  it("400 on malformed JSON body", async () => {
    const bad = "{ not-json";
    const res = await POST(mkReq(bad, sign(bad)) as any);
    expect(res.status).toBe(400);
  });

  it("400 when job_id is missing from a valid-JSON payload", async () => {
    const body = JSON.stringify({ status: "Succeeded" });
    const res = await POST(mkReq(body, sign(body)) as any);
    expect(res.status).toBe(400);
  });
});

function afterEach() {
  // noop — kept for symmetry if we add cleanup later
}
