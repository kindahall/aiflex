/**
 * Unit tests for lib/api-usage.ts (V8 §25.8).
 *
 * Validates the bump helper is fail-soft (never throws even on DB errors)
 * and the monthly aggregator returns correct totals.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  dailyApiUsage: {
    upsert: (...a: unknown[]) => Promise<unknown>;
    findMany: (...a: unknown[]) => Promise<unknown[]>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  mod = await import("@/lib/api-usage");
});

describe("bumpUsage", () => {
  it("ignores zero or negative amounts (no-op)", async () => {
    await mod.bumpUsage("u_1", "claudeTokens", 0);
    await mod.bumpUsage("u_1", "claudeTokens", -10);
    expect(prismaMock.dailyApiUsage.upsert).not.toHaveBeenCalled();
  });

  it("upserts with the correct kind and amount", async () => {
    prismaMock.dailyApiUsage.upsert.mockResolvedValueOnce({});
    await mod.bumpUsage("u_1", "fluxImages", 3);
    const call = prismaMock.dailyApiUsage.upsert.mock.calls[0]?.[0] as
      | {
          where: { userId_date: { userId: string } };
          update: { fluxImages: { increment: number } };
          create: { userId: string; fluxImages: number };
        }
      | undefined;
    expect(call?.where.userId_date.userId).toBe("u_1");
    expect(call?.update.fluxImages.increment).toBe(3);
    expect(call?.create.fluxImages).toBe(3);
  });

  it("never throws when the upsert fails (instrumentation must not break callers)", async () => {
    prismaMock.dailyApiUsage.upsert.mockRejectedValueOnce(new Error("DB down"));
    await expect(mod.bumpUsage("u_1", "claudeTokens", 100)).resolves.toBeUndefined();
  });
});

describe("getMonthlyUsage", () => {
  it("returns zeros across all kinds when no rows exist", async () => {
    prismaMock.dailyApiUsage.findMany.mockResolvedValueOnce([]);
    const r = await mod.getMonthlyUsage("u_1");
    expect(r.claudeTokens).toBe(0);
    expect(r.fluxImages).toBe(0);
    expect(r.seedanceSeconds).toBe(0);
    expect(r.perDay).toEqual([]);
  });

  it("sums correctly across multiple days", async () => {
    prismaMock.dailyApiUsage.findMany.mockResolvedValueOnce([
      {
        date: new Date("2026-04-01T00:00:00Z"),
        claudeTokens: 100,
        openaiTokens: 0,
        fluxImages: 2,
        seedanceSeconds: 30,
        whisperMinutes: 0,
        elevenLabsChars: 0,
      },
      {
        date: new Date("2026-04-02T00:00:00Z"),
        claudeTokens: 50,
        openaiTokens: 200,
        fluxImages: 5,
        seedanceSeconds: 45,
        whisperMinutes: 3,
        elevenLabsChars: 1500,
      },
    ]);
    const r = await mod.getMonthlyUsage("u_1");
    expect(r.claudeTokens).toBe(150);
    expect(r.openaiTokens).toBe(200);
    expect(r.fluxImages).toBe(7);
    expect(r.seedanceSeconds).toBe(75);
    expect(r.whisperMinutes).toBe(3);
    expect(r.elevenLabsChars).toBe(1500);
    expect(r.perDay.length).toBe(2);
    expect(r.perDay[0].date).toBe("2026-04-01");
  });

  it("month string uses the requested month, not now", async () => {
    prismaMock.dailyApiUsage.findMany.mockResolvedValueOnce([]);
    const r = await mod.getMonthlyUsage(
      "u_1",
      new Date(Date.UTC(2025, 11, 1))
    );
    expect(r.month).toBe("2025-12");
  });
});
