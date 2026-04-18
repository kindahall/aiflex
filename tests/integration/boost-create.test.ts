/**
 * Integration tests for POST /api/boost/create (V8 §3.5).
 *
 * Eligibility gates: owner only, film public, status=ready, valid boost type.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  project: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

class MockAuthError extends Error {
  public status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: "u_owner",
    email: "u@x.com",
    name: "U",
    role: "user",
  })),
  AuthError: MockAuthError,
}));

const checkoutMock = vi.fn(async (_p: Record<string, unknown>) => "https://stripe.test/x");
vi.mock("@/lib/stripe-oneshot", () => ({
  createOneShotCheckout: checkoutMock,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  checkoutMock.mockClear();
  vi.resetModules();
  const mod = await import("@/app/api/boost/create/route");
  POST = mod.POST;
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/boost/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/boost/create", () => {
  const goodBody = { projectId: "p_1", boostType: "homepage_24h" };

  it("400 when fields missing", async () => {
    const res = await POST(req({ projectId: "p_1" }));
    expect(res.status).toBe(400);
  });

  it("400 on invalid boostType", async () => {
    const res = await POST(req({ projectId: "p_1", boostType: "ghost" }));
    expect(res.status).toBe(400);
  });

  it("404 when project doesn't exist", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req(goodBody));
    expect(res.status).toBe(404);
  });

  it("403 when caller is not the owner", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "p_1",
      ownerId: "someone_else",
      title: "T",
      status: "ready",
      visibility: "public",
    });
    const res = await POST(req(goodBody));
    expect(res.status).toBe(403);
    expect(checkoutMock).not.toHaveBeenCalled();
  });

  it("400 when status != ready", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "p_1",
      ownerId: "u_owner",
      title: "T",
      status: "generating",
      visibility: "public",
    });
    const res = await POST(req(goodBody));
    expect(res.status).toBe(400);
  });

  it("400 when not public", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "p_1",
      ownerId: "u_owner",
      title: "T",
      status: "ready",
      visibility: "private",
    });
    const res = await POST(req(goodBody));
    expect(res.status).toBe(400);
  });

  it("happy path → returns Stripe URL with correct metadata", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "p_1",
      ownerId: "u_owner",
      title: "Mon film",
      status: "ready",
      visibility: "public",
    });
    const res = await POST(req(goodBody));
    expect(res.status).toBe(200);
    expect(checkoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "boost",
        userId: "u_owner",
        metadata: expect.objectContaining({
          projectId: "p_1",
          boostType: "homepage_24h",
        }),
      })
    );
  });
});
