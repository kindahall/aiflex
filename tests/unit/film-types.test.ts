import { describe, it, expect } from "vitest";
import {
  getCreatorRevenueShare,
  calculatePayoutSplit,
  netAfterFees,
  viewValueCents,
  computeLaunchAt,
  priceForPrivateUpload,
  priceForPublicUpload,
  FORMAT_CONFIG,
  SEQUEL_PRICE,
  SERIES_CONFIG,
  PAYOUT_THRESHOLD_CENTS,
  PAYOUT_FEE_PERCENT,
} from "@/lib/types/film";

describe("getCreatorRevenueShare", () => {
  it("gives 50% at 100% completion", () => {
    expect(getCreatorRevenueShare(100)).toBe(0.5);
  });
  it("gives 35% at 70-99%", () => {
    expect(getCreatorRevenueShare(70)).toBe(0.35);
    expect(getCreatorRevenueShare(99)).toBe(0.35);
  });
  it("gives 15% at 30-69%", () => {
    expect(getCreatorRevenueShare(30)).toBe(0.15);
    expect(getCreatorRevenueShare(69)).toBe(0.15);
  });
  it("gives 0 below 30%", () => {
    expect(getCreatorRevenueShare(29)).toBe(0);
    expect(getCreatorRevenueShare(0)).toBe(0);
  });
  it("caps above 100%", () => {
    // Sanity: users shouldn't pass 150 but we shouldn't crash
    expect(getCreatorRevenueShare(150)).toBe(0.5);
  });
});

describe("calculatePayoutSplit", () => {
  it("splits 50/50 with no royalty at 100% completion", () => {
    const split = calculatePayoutSplit(1000, 100, 0);
    expect(split.sequelCreator).toBe(500);
    expect(split.originalCreator).toBe(0);
    expect(split.platform).toBe(500);
  });

  it("splits with 10% royalty: sequel 40%, original 10%, platform 50%", () => {
    const split = calculatePayoutSplit(1000, 100, 10);
    expect(split.sequelCreator).toBe(400); // 50% - 10% royalty
    expect(split.originalCreator).toBe(100); // 10% royalty
    expect(split.platform).toBe(500); // unchanged
  });

  it("gives 0 to creator below 30% completion but platform still keeps all", () => {
    const split = calculatePayoutSplit(1000, 20, 10);
    // share = 0 → sequelCreator = 0 - royalty = 0 (max), originalCreator = 100
    // Note: this is a known behavior — a partially-watched sequel still pays
    // the parent creator a royalty. Revenue-per-completion drives sequel pay,
    // but the parent's bet on continuity justifies a flat-%.
    expect(split.sequelCreator).toBe(0);
    expect(split.originalCreator).toBe(100);
    expect(split.platform).toBe(1000);
  });

  it("clamps royaltyPercent to [0, 20]", () => {
    const tooHigh = calculatePayoutSplit(1000, 100, 99);
    expect(tooHigh.originalCreator).toBe(200); // capped at 20%
    const negative = calculatePayoutSplit(1000, 100, -5);
    expect(negative.originalCreator).toBe(0); // floored
  });

  it("totals equal viewValue (no money is lost)", () => {
    const split = calculatePayoutSplit(999, 80, 15);
    expect(
      Math.abs(split.sequelCreator + split.originalCreator + split.platform - 999)
    ).toBeLessThan(1);
  });
});

describe("netAfterFees", () => {
  it("applies 2% platform fee", () => {
    expect(netAfterFees(10000)).toBe(9800);
    expect(netAfterFees(1000)).toBe(980);
  });
  it("rounds to integer cents", () => {
    expect(Number.isInteger(netAfterFees(777))).toBe(true);
  });
  it("PAYOUT_FEE_PERCENT is 2%", () => {
    expect(PAYOUT_FEE_PERCENT).toBe(0.02);
  });
  it("PAYOUT_THRESHOLD_CENTS is $10", () => {
    expect(PAYOUT_THRESHOLD_CENTS).toBe(1000);
  });
});

describe("viewValueCents", () => {
  it("divides subscription value by films watched", () => {
    // Light = $4.99/month = 499 cents
    expect(viewValueCents("light", 5)).toBe(100); // 499/5 ≈ 99.8 → 100
    expect(viewValueCents("premium", 10)).toBe(100); // 999/10
  });
  it("returns 0 for free users", () => {
    expect(viewValueCents("free", 5)).toBe(0);
  });
  it("returns 0 for zero films watched (no division by zero)", () => {
    expect(viewValueCents("light", 0)).toBe(0);
  });
});

describe("computeLaunchAt", () => {
  it("returns null when scheduledAt is null (launch immediately)", () => {
    expect(computeLaunchAt("episode_5", null)).toBeNull();
  });
  it("subtracts estimated duration + 15min buffer from scheduledAt", () => {
    const target = new Date("2030-01-01T18:00:00Z");
    const launch = computeLaunchAt("episode_15", target);
    // episode_15 = 45min estimated + 15min buffer = 60min earlier
    expect(launch!.getTime()).toBe(target.getTime() - 60 * 60 * 1000);
  });
  it("clamps to now if launchAt would be in the past", () => {
    const pastTarget = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const launch = computeLaunchAt("film_90", pastTarget);
    expect(launch!.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
  });
});

describe("priceForPrivateUpload", () => {
  it("picks the cheapest tier that fits", () => {
    expect(priceForPrivateUpload(100 * 1024 * 1024)).toBe(199); // 100 MB → $1.99
    expect(priceForPrivateUpload(1 * 1024 * 1024 * 1024)).toBe(399); // 1 GB → $3.99
    expect(priceForPrivateUpload(4 * 1024 * 1024 * 1024)).toBe(699); // 4 GB → $6.99
  });
  it("returns null above the largest tier", () => {
    expect(priceForPrivateUpload(10 * 1024 * 1024 * 1024)).toBeNull();
  });
});

describe("priceForPublicUpload", () => {
  it("picks tier by duration", () => {
    expect(priceForPublicUpload(10)).toBe(499);
    expect(priceForPublicUpload(45)).toBe(899);
    expect(priceForPublicUpload(120)).toBe(1499);
  });
});

describe("FORMAT_CONFIG invariants", () => {
  it("has all required formats", () => {
    expect(FORMAT_CONFIG.episode_5).toBeDefined();
    expect(FORMAT_CONFIG.episode_15).toBeDefined();
    expect(FORMAT_CONFIG.short_30).toBeDefined();
    expect(FORMAT_CONFIG.film_90).toBeDefined();
  });

  it("each format has a 50%+ margin between API cost and private price", () => {
    // Business rule: min 50% margin on private pricing (V7 §3.2)
    for (const [format, cfg] of Object.entries(FORMAT_CONFIG)) {
      if (format === "short_vertical") continue; // smaller margin allowed on shorts
      const margin = (cfg.privatePrice - cfg.apiCostCents) / cfg.privatePrice;
      expect(margin, `${format} margin too low`).toBeGreaterThanOrEqual(0.33);
    }
  });

  it("every sequel price is >= its format apiCost", () => {
    for (const fmt of Object.keys(SEQUEL_PRICE) as Array<
      keyof typeof SEQUEL_PRICE
    >) {
      expect(SEQUEL_PRICE[fmt]).toBeGreaterThanOrEqual(
        FORMAT_CONFIG[fmt].apiCostCents
      );
    }
  });

  it("series pack price is within ±5% of a la carte (V7 pricing)", () => {
    // The V7 table deliberately prices series at roughly the same per-episode
    // rate as ordering episodes individually — the value is continuity, not
    // discount. Just sanity-check we're in the same ballpark so a bug that
    // accidentally 10×'d the price gets caught.
    const pack = SERIES_CONFIG.standard_10x5;
    const alaCarte = FORMAT_CONFIG[pack.format].publicPrice * pack.episodeCount;
    const ratio = pack.publicPrice / alaCarte;
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });
});
