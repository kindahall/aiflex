/**
 * Unit tests for lib/referral.ts (V8 §21.3).
 *
 * Validates idempotency of the link creation, the conversion counters,
 * and the public-safe view returned to the dashboard.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  referralLink: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    create: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
    updateMany: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  mod = await import("@/lib/referral");
});

describe("getOrCreateReferralLink", () => {
  it("returns the existing link without creating one", async () => {
    prismaMock.referralLink.findUnique.mockResolvedValueOnce({
      id: "rl_1",
      userId: "u_1",
      code: "XYZ12345AB",
      signups: 2,
      conversions: 1,
      earnedCents: 500,
      createdAt: new Date(),
    });
    const link = await mod.getOrCreateReferralLink("u_1");
    expect(link.code).toBe("XYZ12345AB");
    expect(prismaMock.referralLink.create).not.toHaveBeenCalled();
  });

  it("creates a new link when none exists", async () => {
    prismaMock.referralLink.findUnique.mockResolvedValueOnce(null);
    prismaMock.referralLink.create.mockResolvedValueOnce({
      id: "rl_new",
      userId: "u_1",
      code: "ABCDEF1234",
      signups: 0,
      conversions: 0,
      earnedCents: 0,
      createdAt: new Date(),
    });
    const link = await mod.getOrCreateReferralLink("u_1");
    expect(link.code).toBe("ABCDEF1234");
    expect(prismaMock.referralLink.create).toHaveBeenCalledTimes(1);
  });

  it("retries on collision and eventually succeeds", async () => {
    prismaMock.referralLink.findUnique.mockResolvedValueOnce(null);
    // First attempt → unique violation, second succeeds
    prismaMock.referralLink.create
      .mockRejectedValueOnce(new Error("Unique constraint failed"))
      .mockResolvedValueOnce({
        id: "rl_2",
        userId: "u_1",
        code: "RETRYCODE2",
        signups: 0,
        conversions: 0,
        earnedCents: 0,
        createdAt: new Date(),
      });
    const link = await mod.getOrCreateReferralLink("u_1");
    expect(link.code).toBe("RETRYCODE2");
    expect(prismaMock.referralLink.create).toHaveBeenCalledTimes(2);
  });

  it("throws after 5 collision retries", async () => {
    prismaMock.referralLink.findUnique.mockResolvedValueOnce(null);
    prismaMock.referralLink.create.mockRejectedValue(new Error("collision"));
    await expect(mod.getOrCreateReferralLink("u_1")).rejects.toThrow();
    expect(prismaMock.referralLink.create).toHaveBeenCalledTimes(5);
  });
});

describe("recordReferralSignup", () => {
  it("returns null and is a no-op when code is unknown", async () => {
    prismaMock.referralLink.findUnique.mockResolvedValueOnce(null);
    const r = await mod.recordReferralSignup("UNKNOWN");
    expect(r).toBeNull();
    expect(prismaMock.referralLink.update).not.toHaveBeenCalled();
  });

  it("increments signups and returns the referrer userId on hit", async () => {
    prismaMock.referralLink.findUnique.mockResolvedValueOnce({ userId: "u_referrer" });
    prismaMock.referralLink.update.mockResolvedValueOnce({});
    const r = await mod.recordReferralSignup("VALID");
    expect(r).toBe("u_referrer");
    const call = prismaMock.referralLink.update.mock.calls[0]?.[0] as
      | { data: { signups: { increment: number } } }
      | undefined;
    expect(call?.data.signups.increment).toBe(1);
  });
});

describe("recordReferralConversion", () => {
  it("bumps conversions and earnedCents", async () => {
    prismaMock.referralLink.updateMany.mockResolvedValueOnce({});
    await mod.recordReferralConversion("u_referrer", 499);
    const call = prismaMock.referralLink.updateMany.mock.calls[0]?.[0] as
      | { data: { conversions: { increment: number }; earnedCents: { increment: number } } }
      | undefined;
    expect(call?.data.conversions.increment).toBe(1);
    expect(call?.data.earnedCents.increment).toBe(499);
  });
});

describe("getReferralStatus", () => {
  it("returns a public-safe view with shareUrl", async () => {
    prismaMock.referralLink.findUnique.mockResolvedValueOnce({
      id: "rl_1",
      userId: "u_1",
      code: "MYCODE1234",
      signups: 5,
      conversions: 2,
      earnedCents: 999,
      createdAt: new Date(),
    });
    const status = await mod.getReferralStatus("u_1");
    expect(status.code).toBe("MYCODE1234");
    expect(status.shareUrl).toContain("?ref=MYCODE1234");
    expect(status.signups).toBe(5);
    expect(status.earnedCents).toBe(999);
  });
});
