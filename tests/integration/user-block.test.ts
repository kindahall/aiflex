/**
 * Integration tests for /api/users/[id]/block (V8 §24.4).
 *
 * Validates the self-block guard, idempotency on POST, and the silent
 * no-op on DELETE when no row exists.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  user: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
  block: {
    upsert: (...a: unknown[]) => Promise<unknown>;
    delete: (...a: unknown[]) => Promise<unknown>;
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
    id: "u_self",
    email: "u@x.com",
    name: "U",
    role: "user",
  })),
  AuthError: MockAuthError,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  const mod = await import("@/app/api/users/[id]/block/route");
  POST = mod.POST;
  DELETE = mod.DELETE;
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/users/[id]/block", () => {
  it("400 when trying to block oneself", async () => {
    const res = await POST(new Request("http://test", { method: "POST" }), ctx("u_self"));
    expect(res.status).toBe(400);
  });

  it("404 when target user doesn't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://test", { method: "POST" }),
      ctx("ghost")
    );
    expect(res.status).toBe(404);
  });

  it("200 + upsert called when target exists", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u_target" });
    prismaMock.block.upsert.mockResolvedValueOnce({});

    const res = await POST(
      new Request("http://test", { method: "POST" }),
      ctx("u_target")
    );
    expect(res.status).toBe(200);
    expect(prismaMock.block.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_blockedUserId: { userId: "u_self", blockedUserId: "u_target" },
        },
      })
    );
  });

  it("idempotent — repeat blocks succeed silently via upsert", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u_target" });
    prismaMock.block.upsert.mockResolvedValue({});

    const r1 = await POST(new Request("http://test", { method: "POST" }), ctx("u_target"));
    const r2 = await POST(new Request("http://test", { method: "POST" }), ctx("u_target"));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(prismaMock.block.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("DELETE /api/users/[id]/block", () => {
  it("200 even when no block row exists (idempotent unblock)", async () => {
    prismaMock.block.delete.mockRejectedValueOnce(new Error("Record not found"));
    const res = await DELETE(
      new Request("http://test", { method: "DELETE" }),
      ctx("u_target")
    );
    expect(res.status).toBe(200);
  });

  it("200 when block row is deleted", async () => {
    prismaMock.block.delete.mockResolvedValueOnce({});
    const res = await DELETE(
      new Request("http://test", { method: "DELETE" }),
      ctx("u_target")
    );
    expect(res.status).toBe(200);
  });
});
