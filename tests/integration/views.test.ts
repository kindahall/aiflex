/**
 * Integration tests for POST /api/views (V7 §8.1 — Spotify-style payout math).
 *
 * Invariants:
 *   1. New view in a fresh day → creates a row + bumps Project.views counter
 *   2. Second view same day with higher pct → updates existing (keeps max)
 *   3. Second view same day with lower pct → no update
 *   4. projectId required, percentageWatched clamped to [0, 100]
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  filmView: {
    findFirst: (...a: unknown[]) => Promise<unknown>;
    create: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
  };
  project: {
    update: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: "user_1",
    email: "u@x.com",
    name: "U",
    role: "user",
    plan: "premium",
  })),
  AuthError: class AuthError extends Error {
    public status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  const mod = await import("@/app/api/views/route");
  POST = mod.POST;
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/views", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/views — validation", () => {
  it("400 when projectId missing", async () => {
    const res = await POST(req({ percentageWatched: 50 }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/views — first view of the day", () => {
  it("creates FilmView + increments Project.views", async () => {
    prismaMock.filmView.findFirst.mockResolvedValueOnce(null); // no existing
    prismaMock.filmView.create.mockResolvedValueOnce({});
    prismaMock.project.update.mockResolvedValueOnce({});

    const res = await POST(req({ projectId: "p1", percentageWatched: 72 }));
    expect(res.status).toBe(200);

    expect(prismaMock.filmView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "p1",
          userId: "user_1",
          percentageWatched: 72,
          userPlan: "premium",
        }),
      })
    );
    expect(prismaMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: { views: { increment: 1 } },
      })
    );
  });
});

describe("POST /api/views — dedup", () => {
  it("updates existing row when new pct is higher", async () => {
    prismaMock.filmView.findFirst.mockResolvedValueOnce({
      id: "view_1",
      percentageWatched: 40,
    });
    prismaMock.filmView.update.mockResolvedValueOnce({});

    const res = await POST(req({ projectId: "p1", percentageWatched: 85 }));
    expect(res.status).toBe(200);
    expect(prismaMock.filmView.update).toHaveBeenCalledWith({
      where: { id: "view_1" },
      data: { percentageWatched: 85 },
    });
    // Must NOT double-count in Project.views — dedup path never increments
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("does NOT update when new pct is lower (keeps the best)", async () => {
    prismaMock.filmView.findFirst.mockResolvedValueOnce({
      id: "view_1",
      percentageWatched: 90,
    });
    const res = await POST(req({ projectId: "p1", percentageWatched: 30 }));
    expect(res.status).toBe(200);
    expect(prismaMock.filmView.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/views — clamping", () => {
  it("clamps negative percentages to 0", async () => {
    prismaMock.filmView.findFirst.mockResolvedValueOnce(null);
    prismaMock.filmView.create.mockResolvedValueOnce({});
    prismaMock.project.update.mockResolvedValueOnce({});

    await POST(req({ projectId: "p1", percentageWatched: -10 }));
    expect(prismaMock.filmView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ percentageWatched: 0 }),
      })
    );
  });

  it("clamps >100 percentages to 100", async () => {
    prismaMock.filmView.findFirst.mockResolvedValueOnce(null);
    prismaMock.filmView.create.mockResolvedValueOnce({});
    prismaMock.project.update.mockResolvedValueOnce({});

    await POST(req({ projectId: "p1", percentageWatched: 250 }));
    expect(prismaMock.filmView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ percentageWatched: 100 }),
      })
    );
  });
});
