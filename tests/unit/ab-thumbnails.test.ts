/**
 * Unit tests for lib/ab-thumbnails.ts (V8 §23.2).
 *
 * Covers the 3 critical operations: random pick + impression bump,
 * click recording, and winner resolution by CTR.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  mod = await import("@/lib/ab-thumbnails");
});

describe("pickThumbnailForImpression", () => {
  it("returns thumbnailUrl when no variants exist", async () => {
    const url = await mod.pickThumbnailForImpression({
      id: "p_1",
      thumbnailUrl: "https://cdn/x.jpg",
      thumbnailVariants: null,
    });
    expect(url).toBe("https://cdn/x.jpg");
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("returns the resolved (active) variant directly", async () => {
    const url = await mod.pickThumbnailForImpression({
      id: "p_1",
      thumbnailUrl: "https://cdn/x.jpg",
      thumbnailVariants: [
        { url: "v1", impressions: 100, clicks: 5, active: false },
        { url: "v2", impressions: 100, clicks: 12, active: true },
      ],
    });
    expect(url).toBe("v2");
  });

  it("rotates uniformly + best-effort bumps impressions", async () => {
    const variants = [
      { url: "v1", impressions: 0, clicks: 0 },
      { url: "v2", impressions: 0, clicks: 0 },
    ];
    const spy = vi.spyOn(Math, "random").mockReturnValue(0); // pick index 0
    prismaMock.project.update.mockResolvedValueOnce({});

    const url = await mod.pickThumbnailForImpression({
      id: "p_1",
      thumbnailUrl: null,
      thumbnailVariants: variants,
    });
    expect(url).toBe("v1");
    spy.mockRestore();
  });
});

describe("recordThumbnailClick", () => {
  it("increments clicks on the matching variant", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      thumbnailVariants: [
        { url: "v1", impressions: 100, clicks: 5 },
        { url: "v2", impressions: 100, clicks: 7 },
      ],
    });
    prismaMock.project.update.mockResolvedValueOnce({});
    await mod.recordThumbnailClick("p_1", "v2");

    const call = prismaMock.project.update.mock.calls[0]?.[0] as
      | { data: { thumbnailVariants: Array<{ url: string; clicks: number }> } }
      | undefined;
    const updated = call?.data.thumbnailVariants.find((v) => v.url === "v2");
    expect(updated?.clicks).toBe(8);
  });

  it("silently no-ops when URL doesn't match any variant", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      thumbnailVariants: [{ url: "v1", impressions: 100, clicks: 5 }],
    });
    await mod.recordThumbnailClick("p_1", "ghost");
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });
});

describe("resolveBestThumbnail", () => {
  it("skips when there are no variants", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      thumbnailVariants: null,
    });
    const r = await mod.resolveBestThumbnail("p_1");
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe("no variants");
  });

  it("skips when test is already resolved", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      thumbnailVariants: [
        { url: "v1", impressions: 100, clicks: 5, active: true },
        { url: "v2", impressions: 100, clicks: 12 },
      ],
    });
    const r = await mod.resolveBestThumbnail("p_1");
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe("already resolved");
  });

  it("skips when total impressions < minImpressions threshold", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      thumbnailVariants: [
        { url: "v1", impressions: 10, clicks: 1 },
        { url: "v2", impressions: 20, clicks: 5 },
      ],
    });
    const r = await mod.resolveBestThumbnail("p_1", 100);
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe("insufficient data");
  });

  it("promotes the highest-CTR variant when threshold is met", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      thumbnailVariants: [
        { url: "v1", impressions: 100, clicks: 5 },   // CTR 5%
        { url: "v2", impressions: 200, clicks: 30 },  // CTR 15%
        { url: "v3", impressions: 100, clicks: 8 },   // CTR 8%
      ],
    });
    prismaMock.project.update.mockResolvedValueOnce({});
    const r = await mod.resolveBestThumbnail("p_1", 100);
    expect(r.resolved).toBe(true);
    expect(r.winnerUrl).toBe("v2");
    const call = prismaMock.project.update.mock.calls[0]?.[0] as
      | { data: { thumbnailUrl: string; thumbnailVariants: Array<{ url: string; active?: boolean }> } }
      | undefined;
    expect(call?.data.thumbnailUrl).toBe("v2");
    const winner = call?.data.thumbnailVariants.find((v) => v.url === "v2");
    expect(winner?.active).toBe(true);
  });
});
