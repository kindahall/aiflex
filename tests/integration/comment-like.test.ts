/**
 * Integration tests for /api/comments/[id]/like (V8 §24.1).
 *
 * Validates the idempotent like + silent unlike behavior backed by
 * CommentLike model.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  comment: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
  commentLike: {
    create: (...a: unknown[]) => Promise<unknown>;
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
    id: "u_1",
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
  const mod = await import("@/app/api/comments/[id]/like/route");
  POST = mod.POST;
  DELETE = mod.DELETE;
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/comments/[id]/like", () => {
  it("404 when the comment doesn't exist", async () => {
    prismaMock.comment.findUnique.mockResolvedValueOnce(null);
    const res = await POST(new Request("http://test", { method: "POST" }), ctx("c_missing"));
    expect(res.status).toBe(404);
    expect(prismaMock.commentLike.create).not.toHaveBeenCalled();
  });

  it("creates a like with the right (userId, commentId)", async () => {
    prismaMock.comment.findUnique.mockResolvedValueOnce({ id: "c_1" });
    prismaMock.commentLike.create.mockResolvedValueOnce({});

    const res = await POST(new Request("http://test", { method: "POST" }), ctx("c_1"));
    expect(res.status).toBe(200);
    expect(prismaMock.commentLike.create).toHaveBeenCalledWith({
      data: { userId: "u_1", commentId: "c_1" },
    });
  });

  it("idempotent: returns 200 even when create throws on unique violation", async () => {
    prismaMock.comment.findUnique.mockResolvedValueOnce({ id: "c_1" });
    prismaMock.commentLike.create.mockRejectedValueOnce(
      new Error("Unique constraint failed")
    );
    const res = await POST(new Request("http://test", { method: "POST" }), ctx("c_1"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/comments/[id]/like", () => {
  it("returns 200 even when no row exists (silent unlike)", async () => {
    prismaMock.commentLike.delete.mockRejectedValueOnce(new Error("not found"));
    const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("c_1"));
    expect(res.status).toBe(200);
  });

  it("returns 200 when delete succeeds", async () => {
    prismaMock.commentLike.delete.mockResolvedValueOnce({});
    const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("c_1"));
    expect(res.status).toBe(200);
    expect(prismaMock.commentLike.delete).toHaveBeenCalledWith({
      where: { userId_commentId: { userId: "u_1", commentId: "c_1" } },
    });
  });
});
