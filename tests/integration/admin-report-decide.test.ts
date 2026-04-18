/**
 * Integration tests for POST /api/admin/reports/[id]/decide (V8 §19.5).
 *
 * Validates admin-only auth + action enum + delegation to applyReportDecision.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

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

const applyReportDecisionMock = vi.fn(async (_p: Record<string, unknown>) => {});
vi.mock("@/lib/reports", () => ({
  applyReportDecision: applyReportDecisionMock,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

beforeEach(async () => {
  applyReportDecisionMock.mockClear();
  vi.resetModules();
  const mod = await import("@/app/api/admin/reports/[id]/decide/route");
  POST = mod.POST;
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/admin/reports/r_1/decide", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "r_1" }) };

describe("POST /api/admin/reports/[id]/decide", () => {
  it("401 when not authenticated", async () => {
    authState.user = null;
    const res = await POST(req({ action: "removed" }), ctx);
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but not admin", async () => {
    authState.user = { id: "u_1", role: "user" };
    const res = await POST(req({ action: "removed" }), ctx);
    expect(res.status).toBe(403);
    expect(applyReportDecisionMock).not.toHaveBeenCalled();
  });

  it("400 on invalid action enum", async () => {
    authState.user = { id: "admin_1", role: "admin" };
    const res = await POST(req({ action: "delete-everything" }), ctx);
    expect(res.status).toBe(400);
    expect(applyReportDecisionMock).not.toHaveBeenCalled();
  });

  it("delegates to applyReportDecision with admin id and IP", async () => {
    authState.user = { id: "admin_1", role: "admin" };
    const res = await POST(req({ action: "removed" }), ctx);
    expect(res.status).toBe(200);
    expect(applyReportDecisionMock).toHaveBeenCalledWith({
      reportId: "r_1",
      adminId: "admin_1",
      action: "removed",
      ipAddress: "1.2.3.4",
    });
  });

  it("400 with the underlying error message when applyReportDecision throws", async () => {
    authState.user = { id: "admin_1", role: "admin" };
    applyReportDecisionMock.mockRejectedValueOnce(
      new Error("Ce signalement a déjà été traité.")
    );
    const res = await POST(req({ action: "removed" }), ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("déjà été traité");
  });

  it("accepts all 4 valid actions", async () => {
    authState.user = { id: "admin_1", role: "admin" };
    for (const action of ["removed", "warned", "suspended", "none"]) {
      const res = await POST(req({ action }), ctx);
      expect(res.status, `action=${action}`).toBe(200);
    }
    expect(applyReportDecisionMock).toHaveBeenCalledTimes(4);
  });
});
