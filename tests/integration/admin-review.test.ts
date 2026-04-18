/**
 * Integration tests for POST /api/admin/review/[filmId] (V7 §7.2).
 *
 * Core invariants under test:
 *   1. Only admin role can access
 *   2. Only public user-uploads are reviewable
 *   3. Double-decision is rejected
 *   4. Reject path issues a credit to user.credits atomically
 *   5. Audit log is always written (fire-and-forget, never blocks)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  project: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
  };
  user: {
    update: (...a: unknown[]) => Promise<unknown>;
  };
  $transaction: (ops: unknown[]) => Promise<unknown[]>;
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

class MockAuthError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

const authState = { user: null as null | Record<string, unknown> };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => {
    if (!authState.user) {
      throw new MockAuthError("Unauthorized", 401);
    }
    return authState.user;
  }),
  AuthError: MockAuthError,
}));

const notifyMock = vi.fn(async (_input: Record<string, unknown>) => {});
vi.mock("@/lib/notify", () => ({ notify: notifyMock }));

const auditMock = vi.fn(async (_input: Record<string, unknown>) => {});
vi.mock("@/lib/audit", () => ({ logAdminAction: auditMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request, ctx: { params: Promise<{ filmId: string }> }) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  notifyMock.mockClear();
  auditMock.mockClear();
  vi.resetModules();
  const mod = await import("@/app/api/admin/review/[filmId]/route");
  POST = mod.POST;
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/admin/review/film_1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ filmId: "film_1" }) };

// --- Tests ---------------------------------------------------------------

describe("POST /api/admin/review — auth", () => {
  it("403 when user is not admin", async () => {
    authState.user = { id: "u1", role: "user" };
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(403);
  });

  it("401 when no user logged in", async () => {
    authState.user = null;
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/review — validation", () => {
  beforeEach(() => {
    authState.user = { id: "admin_1", role: "admin" };
  });

  it("400 when decision is not approve/reject", async () => {
    const res = await POST(req({ decision: "maybe" }), ctx);
    expect(res.status).toBe(400);
  });

  it("404 when film does not exist", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(404);
  });

  it("400 when film is an AI-generated film (no review needed)", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "film_1",
      ownerId: "u_1",
      uploadType: "ai_generated",
      adminReviewStatus: null,
      visibility: "public",
    });
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(400);
  });

  it("400 when film is private (never reviewed)", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "film_1",
      ownerId: "u_1",
      uploadType: "user_upload",
      adminReviewStatus: null,
      visibility: "private",
    });
    const res = await POST(req({ decision: "approve" }), ctx);
    expect(res.status).toBe(400);
  });

  it("400 when already decided", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "film_1",
      ownerId: "u_1",
      uploadType: "user_upload",
      visibility: "public",
      adminReviewStatus: "approved",
    });
    const res = await POST(req({ decision: "reject" }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/review — approve path", () => {
  beforeEach(() => {
    authState.user = { id: "admin_1", role: "admin" };
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "film_1",
      ownerId: "creator_1",
      title: "Upload",
      uploadType: "user_upload",
      visibility: "public",
      adminReviewStatus: "pending_review",
      amountPaid: 999,
      creditIssued: false,
    });
  });

  it("200 + project.update called with approved status", async () => {
    prismaMock.project.update.mockResolvedValueOnce({});
    const res = await POST(req({ decision: "approve", note: "OK" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("approve");

    const updateCall = prismaMock.project.update.mock.calls[0]?.[0] as
      | { data: { adminReviewStatus: string; status: string } }
      | undefined;
    expect(updateCall?.data.adminReviewStatus).toBe("approved");
    expect(updateCall?.data.status).toBe("ready");
  });

  it("notifies the creator with video-ready kind", async () => {
    prismaMock.project.update.mockResolvedValueOnce({});
    await POST(req({ decision: "approve" }), ctx);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0]?.[0]).toMatchObject({
      userId: "creator_1",
      kind: "video-ready",
    });
  });

  it("writes an approve_film audit log", async () => {
    prismaMock.project.update.mockResolvedValueOnce({});
    await POST(req({ decision: "approve", note: "Great" }), ctx);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]?.[0]).toMatchObject({
      adminId: "admin_1",
      action: "approve_film",
      targetId: "film_1",
      targetType: "film",
    });
  });
});

describe("POST /api/admin/review — reject path", () => {
  beforeEach(() => {
    authState.user = { id: "admin_1", role: "admin" };
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "film_1",
      ownerId: "creator_1",
      title: "Upload",
      uploadType: "user_upload",
      visibility: "public",
      adminReviewStatus: "pending_review",
      amountPaid: 999,
      creditIssued: false,
    });
  });

  it("200 and returns creditAmount", async () => {
    prismaMock.$transaction.mockResolvedValueOnce([{}, {}]);
    const res = await POST(req({ decision: "reject", note: "Copyright" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("reject");
    expect(json.creditAmount).toBe(999);
  });

  it("uses $transaction to keep project.update + user.credits increment atomic", async () => {
    prismaMock.$transaction.mockResolvedValueOnce([{}, {}]);
    await POST(req({ decision: "reject", note: "No" }), ctx);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // $transaction should receive an array of 2 prisma promises (update + update)
    const args = prismaMock.$transaction.mock.calls[0]?.[0];
    expect(Array.isArray(args)).toBe(true);
    expect((args as unknown[]).length).toBe(2);
  });

  it("notifies creator with system kind carrying the note", async () => {
    prismaMock.$transaction.mockResolvedValueOnce([{}, {}]);
    await POST(req({ decision: "reject", note: "Copyright issue" }), ctx);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "creator_1",
        kind: "system",
        message: expect.stringContaining("Copyright issue"),
      })
    );
  });

  it("writes a reject_film audit log with creditAmount in metadata", async () => {
    prismaMock.$transaction.mockResolvedValueOnce([{}, {}]);
    await POST(req({ decision: "reject", note: "Nope" }), ctx);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "reject_film",
        metadata: expect.objectContaining({ creditAmount: 999, note: "Nope" }),
      })
    );
  });
});
