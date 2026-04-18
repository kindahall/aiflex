/**
 * Unit tests for lib/creator-pro.ts (V8 §21.7).
 *
 * Mocks Prisma directly via vitest-mock-extended so the quota math, the
 * monthly window roll, and the idempotency are exercised without a DB.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  creatorPlan: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let consumeCreatorProQuota: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getCreatorProStatus: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  const mod = await import("@/lib/creator-pro");
  consumeCreatorProQuota = mod.consumeCreatorProQuota;
  getCreatorProStatus = mod.getCreatorProStatus;
});

describe("consumeCreatorProQuota", () => {
  it("returns { consumed: false } when user has no plan", async () => {
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce(null);
    const r = await consumeCreatorProQuota("u_1", "episode_5");
    expect(r.consumed).toBe(false);
    expect(prismaMock.creatorPlan.update).not.toHaveBeenCalled();
  });

  it("returns { consumed: false } when plan id is unknown", async () => {
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce({
      userId: "u_1",
      plan: "ghost_plan",
      monthlyQuota: {},
      usedThisMonth: {},
      resetAt: new Date(Date.now() + 86400_000),
    });
    const r = await consumeCreatorProQuota("u_1", "episode_5");
    expect(r.consumed).toBe(false);
  });

  it("returns { consumed: false } when format isn't covered by plan quota", async () => {
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce({
      userId: "u_1",
      plan: "creator_pro_basic", // covers episode_5 + episode_15
      monthlyQuota: { episode_5: 2, episode_15: 1 },
      usedThisMonth: {},
      resetAt: new Date(Date.now() + 86400_000),
    });
    const r = await consumeCreatorProQuota("u_1", "film_90");
    expect(r.consumed).toBe(false);
  });

  it("returns { consumed: false } and remaining map when quota is exhausted", async () => {
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce({
      userId: "u_1",
      plan: "creator_pro_basic",
      monthlyQuota: { episode_5: 2, episode_15: 1 },
      usedThisMonth: { episode_5: 2, episode_15: 0 },
      resetAt: new Date(Date.now() + 86400_000),
    });
    const r = await consumeCreatorProQuota("u_1", "episode_5");
    expect(r.consumed).toBe(false);
    expect(r.remaining?.episode_5).toBe(0);
    expect(r.remaining?.episode_15).toBe(1);
    expect(prismaMock.creatorPlan.update).not.toHaveBeenCalled();
  });

  it("consumes a unit and persists when quota is available", async () => {
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce({
      userId: "u_1",
      plan: "creator_pro_basic",
      monthlyQuota: { episode_5: 2, episode_15: 1 },
      usedThisMonth: { episode_5: 0 },
      resetAt: new Date(Date.now() + 86400_000),
    });
    prismaMock.creatorPlan.update.mockResolvedValueOnce({});
    const r = await consumeCreatorProQuota("u_1", "episode_5");
    expect(r.consumed).toBe(true);
    expect(r.remaining?.episode_5).toBe(1);
    expect(prismaMock.creatorPlan.update).toHaveBeenCalledTimes(1);
  });

  it("rolls the monthly window when resetAt has elapsed and consumes", async () => {
    const past = new Date(Date.now() - 60_000);
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce({
      userId: "u_1",
      plan: "creator_pro_basic",
      monthlyQuota: { episode_5: 2 },
      usedThisMonth: { episode_5: 99 }, // exhausted in the OLD window
      resetAt: past,
    });
    prismaMock.creatorPlan.update.mockResolvedValueOnce({});
    const r = await consumeCreatorProQuota("u_1", "episode_5");
    expect(r.consumed).toBe(true);
    expect(r.remaining?.episode_5).toBe(1);

    const updateCall = prismaMock.creatorPlan.update.mock.calls[0]?.[0] as
      | { data: { resetAt: Date } }
      | undefined;
    expect(updateCall?.data.resetAt).toBeInstanceOf(Date);
    // The new resetAt must be in the future
    expect((updateCall?.data.resetAt as Date).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("getCreatorProStatus", () => {
  it("returns null when user has no plan", async () => {
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce(null);
    const r = await getCreatorProStatus("u_1");
    expect(r).toBeNull();
  });

  it("returns null when plan key is no longer recognised", async () => {
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce({
      userId: "u_1",
      plan: "deleted_plan",
      monthlyQuota: {},
      usedThisMonth: {},
      resetAt: new Date(),
    });
    const r = await getCreatorProStatus("u_1");
    expect(r).toBeNull();
  });

  it("returns plan + remaining map for a known plan", async () => {
    prismaMock.creatorPlan.findUnique.mockResolvedValueOnce({
      userId: "u_1",
      plan: "creator_pro_basic",
      monthlyQuota: { episode_5: 2, episode_15: 1 },
      usedThisMonth: { episode_5: 1 },
      resetAt: new Date(),
    });
    const r = await getCreatorProStatus("u_1");
    expect(r?.plan).toBe("creator_pro_basic");
    expect(r?.remaining?.episode_5).toBe(1);
    expect(r?.remaining?.episode_15).toBe(1);
    expect(r?.priceCents).toBeGreaterThan(0);
  });
});
