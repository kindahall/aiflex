import { describe, expect, it } from "vitest";
import { getAtmosQuotaForUser, getPlanLimits, PLANS } from "@/lib/plans";

/**
 * Wave 11.4 — Atmos cloud tier pricing.
 *
 * Real Dolby Atmos transcode (Dolby.io) bills ~$0.30/output-minute, so
 * Free / Pro tiers MUST land at 0 min and Studio / Family MUST NOT exceed
 * the budgeted caps (30 / 120 min/month). A regression that e.g. flips
 * Free to a non-zero allowance would uncap spend on the free tier.
 */
describe("plans: Atmos cloud tier pricing", () => {
  it("sets the correct per-plan minutes allowance", () => {
    expect(PLANS.free.atmosMinutesPerMonth).toBe(0);
    expect(PLANS.pro.atmosMinutesPerMonth).toBe(0);
    expect(PLANS.studio.atmosMinutesPerMonth).toBe(30);
    expect(PLANS.family.atmosMinutesPerMonth).toBe(120);
  });

  it("exposes the atmos minutes field through getPlanLimits", () => {
    expect(getPlanLimits("free").atmosMinutes).toBe(0);
    expect(getPlanLimits("studio").atmosMinutes).toBe(30);
  });

  it("resolves plan default when no override is present", () => {
    expect(
      getAtmosQuotaForUser({
        role: "user",
        plan: "free",
      })
    ).toBe(0);
    expect(
      getAtmosQuotaForUser({
        role: "user",
        plan: "studio",
      })
    ).toBe(30);
  });

  it("honours an explicit per-user override when set", () => {
    expect(
      getAtmosQuotaForUser({
        role: "user",
        plan: "studio",
        atmosMinutesQuota: 60,
      })
    ).toBe(60);
  });

  it("ignores a negative override (treats as undefined)", () => {
    expect(
      getAtmosQuotaForUser({
        role: "user",
        plan: "studio",
        atmosMinutesQuota: -5,
      })
    ).toBe(30);
  });

  it("returns MAX_SAFE_INTEGER for admins regardless of plan", () => {
    expect(
      getAtmosQuotaForUser({
        role: "admin",
        plan: "free",
      })
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("degrades expired paid plans to the Free quota", () => {
    expect(
      getAtmosQuotaForUser({
        role: "user",
        plan: "studio",
        planExpiresAt: Date.now() - 86_400_000,
      })
    ).toBe(0);
  });
});
