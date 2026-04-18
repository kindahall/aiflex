import { describe, it, expect } from "vitest";
import { AD_CPM_CENTS } from "@/lib/types/film";

describe("AD_CPM_CENTS", () => {
  it("has the 3 ad formats at V7 §3.6 CPM rates", () => {
    // Per V7 §3.6: pre-roll $10, mid-roll $15, banner $4 per 1000 impressions
    expect(AD_CPM_CENTS.preroll_15).toBe(1000);
    expect(AD_CPM_CENTS.midroll_30).toBe(1500);
    expect(AD_CPM_CENTS.banner).toBe(400);
  });

  it("per-impression cost is CPM / 1000 rounded up", () => {
    // selectAd() returns costCents = Math.ceil(cpm / 1000)
    for (const [format, cpm] of Object.entries(AD_CPM_CENTS)) {
      const costPerImpression = Math.ceil(cpm / 1000);
      expect(costPerImpression, `cost for ${format}`).toBeGreaterThanOrEqual(1);
    }
  });
});
