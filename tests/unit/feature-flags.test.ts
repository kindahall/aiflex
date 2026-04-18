/**
 * Unit tests for lib/feature-flags.ts (V8 §B7.6).
 *
 * Validates: defaults when DB unavailable, cache TTL, manual invalidation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  platformSettings: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  mod = await import("@/lib/feature-flags");
});

describe("getFeatureFlags", () => {
  it("returns DEFAULTS when DB is unavailable", async () => {
    prismaMock.platformSettings.findUnique.mockRejectedValueOnce(new Error("DB"));
    const flags = await mod.getFeatureFlags();
    expect(flags.sequelsEnabled).toBe(true);
    expect(flags.adsEnabled).toBe(false);
    expect(flags.shortsEnabled).toBe(false);
  });

  it("returns DB values when present", async () => {
    prismaMock.platformSettings.findUnique.mockResolvedValueOnce({
      sequelsEnabled: false,
      adsEnabled: true,
      shortsEnabled: true,
      dubbingEnabled: false,
      recommendationsEnabled: true,
    });
    const flags = await mod.getFeatureFlags();
    expect(flags.sequelsEnabled).toBe(false);
    expect(flags.adsEnabled).toBe(true);
    expect(flags.recommendationsEnabled).toBe(true);
  });

  it("caches: 2nd call within TTL doesn't hit Prisma again", async () => {
    prismaMock.platformSettings.findUnique.mockResolvedValueOnce({
      sequelsEnabled: true,
      adsEnabled: false,
      shortsEnabled: false,
      dubbingEnabled: false,
      recommendationsEnabled: false,
    });
    await mod.getFeatureFlags();
    await mod.getFeatureFlags();
    await mod.getFeatureFlags();
    expect(prismaMock.platformSettings.findUnique).toHaveBeenCalledTimes(1);
  });

  it("invalidateFeatureFlagsCache() forces re-fetch on next call", async () => {
    prismaMock.platformSettings.findUnique
      .mockResolvedValueOnce({
        sequelsEnabled: true,
        adsEnabled: false,
        shortsEnabled: false,
        dubbingEnabled: false,
        recommendationsEnabled: false,
      })
      .mockResolvedValueOnce({
        sequelsEnabled: false,
        adsEnabled: true,
        shortsEnabled: true,
        dubbingEnabled: true,
        recommendationsEnabled: true,
      });
    await mod.getFeatureFlags();
    mod.invalidateFeatureFlagsCache();
    const after = await mod.getFeatureFlags();
    expect(after.adsEnabled).toBe(true);
    expect(prismaMock.platformSettings.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("isFeatureEnabled", () => {
  it("returns the flag value for a given key", async () => {
    prismaMock.platformSettings.findUnique.mockResolvedValueOnce({
      sequelsEnabled: true,
      adsEnabled: false,
      shortsEnabled: false,
      dubbingEnabled: false,
      recommendationsEnabled: false,
    });
    expect(await mod.isFeatureEnabled("sequelsEnabled")).toBe(true);
    expect(await mod.isFeatureEnabled("adsEnabled")).toBe(false);
  });
});
