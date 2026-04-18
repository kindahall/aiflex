/**
 * Integration tests for /api/me/watchlist/share (V8 §22.3).
 *
 * Validates: empty-list rejection, token reuse across rows, revoke flow.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  watchlist: {
    findMany: (...a: unknown[]) => Promise<unknown[]>;
    updateMany: (...a: unknown[]) => Promise<unknown>;
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
let POST: () => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DELETE: () => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  const mod = await import("@/app/api/me/watchlist/share/route");
  POST = mod.POST;
  DELETE = mod.DELETE;
});

describe("POST /api/me/watchlist/share", () => {
  it("400 when watchlist is empty", async () => {
    prismaMock.watchlist.findMany.mockResolvedValueOnce([]);
    const res = await POST();
    expect(res.status).toBe(400);
  });

  it("generates a fresh token + isPublic when none exists", async () => {
    prismaMock.watchlist.findMany.mockResolvedValueOnce([
      { id: "w_1", shareToken: null, isPublic: false },
      { id: "w_2", shareToken: null, isPublic: false },
    ]);
    prismaMock.watchlist.updateMany.mockResolvedValueOnce({});

    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.shareToken).toBe("string");
    expect(data.shareToken.length).toBeGreaterThan(8);
    expect(data.shareUrl).toContain(`/list/${data.shareToken}`);

    const call = prismaMock.watchlist.updateMany.mock.calls[0]?.[0] as
      | { data: { shareToken: string; isPublic: boolean } }
      | undefined;
    expect(call?.data.shareToken).toBe(data.shareToken);
    expect(call?.data.isPublic).toBe(true);
  });

  it("reuses an existing token rather than rotating it", async () => {
    prismaMock.watchlist.findMany.mockResolvedValueOnce([
      { id: "w_1", shareToken: "EXISTING_TOKEN", isPublic: true },
      { id: "w_2", shareToken: null, isPublic: false },
    ]);
    prismaMock.watchlist.updateMany.mockResolvedValueOnce({});

    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shareToken).toBe("EXISTING_TOKEN");
  });
});

describe("DELETE /api/me/watchlist/share", () => {
  it("clears token + isPublic", async () => {
    prismaMock.watchlist.updateMany.mockResolvedValueOnce({});
    const res = await DELETE();
    expect(res.status).toBe(200);

    const call = prismaMock.watchlist.updateMany.mock.calls[0]?.[0] as
      | { data: { shareToken: null; isPublic: boolean } }
      | undefined;
    expect(call?.data.shareToken).toBeNull();
    expect(call?.data.isPublic).toBe(false);
  });
});
