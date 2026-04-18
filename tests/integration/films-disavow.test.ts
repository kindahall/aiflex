/**
 * Integration tests for POST /api/films/[id]/disavow (V8 §4.4).
 *
 * Critical: only the parent-film owner can disavow a sequel.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  project: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
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
const authState = { user: null as null | Record<string, unknown> };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => {
    if (!authState.user) throw new MockAuthError("Unauthorized", 401);
    return authState.user;
  }),
  AuthError: MockAuthError,
}));

const notifyMock = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notify: notifyMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request, ctx: { params: Promise<{ filmId: string }> }) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  notifyMock.mockClear();
  vi.resetModules();
  const mod = await import("@/app/api/films/[filmId]/disavow/route");
  POST = mod.POST;
});

const ctx = { params: Promise.resolve({ filmId: "sequel_1" }) };
const fakeReq = new Request("http://test/api/films/sequel_1/disavow", { method: "POST" });

describe("POST /api/films/[id]/disavow", () => {
  it("404 when sequel not found", async () => {
    authState.user = { id: "u_parent_owner", role: "user" };
    prismaMock.project.findUnique.mockResolvedValueOnce(null);
    const res = await POST(fakeReq, ctx);
    expect(res.status).toBe(404);
  });

  it("404 when project exists but has no parentFilm (it isn't a sequel)", async () => {
    authState.user = { id: "u_parent_owner", role: "user" };
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "sequel_1",
      ownerId: "u_creator",
      parentFilmId: null,
      parentFilm: null,
    });
    const res = await POST(fakeReq, ctx);
    expect(res.status).toBe(404);
  });

  it("403 when caller is NOT the parent film owner", async () => {
    authState.user = { id: "u_random", role: "user" };
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "sequel_1",
      ownerId: "u_creator",
      title: "Sequel Title",
      parentFilmId: "p_parent",
      parentFilm: {
        id: "p_parent",
        ownerId: "u_parent_owner",
        title: "Parent",
      },
    });
    const res = await POST(fakeReq, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("flips isDisavowed=true + notifies sequel creator", async () => {
    authState.user = { id: "u_parent_owner", role: "user" };
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "sequel_1",
      ownerId: "u_creator",
      title: "Sequel",
      parentFilmId: "p_parent",
      parentFilm: {
        id: "p_parent",
        ownerId: "u_parent_owner",
        title: "Parent",
      },
    });
    prismaMock.project.update.mockResolvedValueOnce({});
    const res = await POST(fakeReq, ctx);
    expect(res.status).toBe(200);

    const upd = prismaMock.project.update.mock.calls[0]?.[0] as
      | { where: { id: string }; data: { isDisavowed: boolean } }
      | undefined;
    expect(upd?.where.id).toBe("sequel_1");
    expect(upd?.data.isDisavowed).toBe(true);

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u_creator",
        kind: "system",
      })
    );
  });
});
