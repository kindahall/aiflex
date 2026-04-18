/**
 * Integration tests for POST /api/sequel-approvals/[jobId] (V8 §20.3).
 *
 * Validates the parent-only auth, status gating, and the credit-on-reject
 * transaction.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  generationJob: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
  };
  project: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
  user: {
    update: (...a: unknown[]) => Promise<unknown>;
  };
  $transaction: (ops: unknown[]) => Promise<unknown[]>;
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

class MockAuthError extends Error {
  public status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

const authState = { user: null as null | Record<string, unknown> };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => {
    if (!authState.user) throw new MockAuthError("Unauthorized", 401);
    return authState.user;
  }),
  AuthError: MockAuthError,
}));

const orchestrateMock = vi.fn(async (_id: string) => {});
vi.mock("@/lib/agent", () => ({ orchestrateGeneration: orchestrateMock }));

const notifyMock = vi.fn(async (_input: Record<string, unknown>) => {});
vi.mock("@/lib/notify", () => ({ notify: notifyMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request, ctx: { params: Promise<{ jobId: string }> }) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  orchestrateMock.mockClear();
  notifyMock.mockClear();
  vi.resetModules();
  const mod = await import("@/app/api/sequel-approvals/[jobId]/route");
  POST = mod.POST;
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/sequel-approvals/job_1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ jobId: "job_1" }) };

describe("POST /api/sequel-approvals — validation", () => {
  beforeEach(() => {
    authState.user = { id: "u_admin", role: "user" };
  });

  it("400 on invalid decision", async () => {
    const res = await POST(req({ decision: "maybe" }), ctx);
    expect(res.status).toBe(400);
  });

  it("404 when job missing", async () => {
    prismaMock.generationJob.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(404);
  });

  it("400 when job not in awaiting_validation status", async () => {
    prismaMock.generationJob.findUnique.mockResolvedValueOnce({
      id: "job_1",
      status: "pending",
      userId: "u_creator",
      formData: { parentFilmId: "p_parent" },
    });
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(400);
  });

  it("400 when job has no parentFilmId in formData", async () => {
    prismaMock.generationJob.findUnique.mockResolvedValueOnce({
      id: "job_1",
      status: "awaiting_validation",
      userId: "u_creator",
      formData: {},
    });
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(400);
  });

  it("404 when parent project missing", async () => {
    prismaMock.generationJob.findUnique.mockResolvedValueOnce({
      id: "job_1",
      status: "awaiting_validation",
      userId: "u_creator",
      formData: { parentFilmId: "p_parent", priceCents: 999 },
    });
    prismaMock.project.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(404);
  });

  it("403 when caller is not the parent creator", async () => {
    prismaMock.generationJob.findUnique.mockResolvedValueOnce({
      id: "job_1",
      status: "awaiting_validation",
      userId: "u_creator",
      formData: { parentFilmId: "p_parent", priceCents: 999 },
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "p_parent",
      ownerId: "someone_else",
      title: "Parent",
    });
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/sequel-approvals — approve", () => {
  beforeEach(() => {
    authState.user = { id: "u_parent_owner", role: "user" };
    prismaMock.generationJob.findUnique.mockResolvedValueOnce({
      id: "job_1",
      status: "awaiting_validation",
      userId: "u_creator",
      formData: { parentFilmId: "p_parent", priceCents: 999 },
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "p_parent",
      ownerId: "u_parent_owner",
      title: "Parent",
    });
    prismaMock.generationJob.update.mockResolvedValue({});
  });

  it("flips job to pending + kicks orchestration", async () => {
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("approve");
    expect(orchestrateMock).toHaveBeenCalledWith("job_1");
  });

  it("notifies the sequel creator with success message", async () => {
    await POST(req({ decision: "approve" }), ctx);
    expect(notifyMock).toHaveBeenCalled();
    expect(notifyMock.mock.calls[0]?.[0]).toMatchObject({
      userId: "u_creator",
      kind: "system",
    });
  });
});

describe("POST /api/sequel-approvals — reject", () => {
  beforeEach(() => {
    authState.user = { id: "u_parent_owner", role: "user" };
  });

  it("transactional: marks job error AND credits user.credits", async () => {
    prismaMock.generationJob.findUnique.mockResolvedValueOnce({
      id: "job_1",
      status: "awaiting_validation",
      userId: "u_creator",
      formData: { parentFilmId: "p_parent", priceCents: 1500 },
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "p_parent",
      ownerId: "u_parent_owner",
      title: "Parent",
    });
    prismaMock.$transaction.mockResolvedValueOnce([{}, {}]);

    const res = await POST(
      req({ decision: "reject", reason: "Hors univers" }),
      ctx
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("reject");
    expect(json.creditedCents).toBe(1500);

    // Transaction must contain TWO ops (job update + user credit increment)
    const ops = prismaMock.$transaction.mock.calls[0]?.[0] as unknown[];
    expect(Array.isArray(ops)).toBe(true);
    expect(ops.length).toBe(2);
  });

  it("skips credit when priceCents is 0 (free run)", async () => {
    prismaMock.generationJob.findUnique.mockResolvedValueOnce({
      id: "job_1",
      status: "awaiting_validation",
      userId: "u_creator",
      formData: { parentFilmId: "p_parent", priceCents: 0 },
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "p_parent",
      ownerId: "u_parent_owner",
      title: "Parent",
    });
    prismaMock.$transaction.mockResolvedValueOnce([{}]);

    const res = await POST(req({ decision: "reject", reason: "no" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.creditedCents).toBe(0);

    const ops = prismaMock.$transaction.mock.calls[0]?.[0] as unknown[];
    expect(ops.length).toBe(1); // only the job update, no credit
  });
});
