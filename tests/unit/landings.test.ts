/**
 * Unit tests for lib/landings.ts (V8 §27.5).
 *
 * Validates the variant catalogue contract — the route handler imports
 * this and statically generates a page per slug, so any change to shape
 * needs to be a deliberate one.
 */

import { describe, it, expect } from "vitest";
import { LANDING_VARIANTS, getLandingVariant } from "@/lib/landings";

describe("LANDING_VARIANTS", () => {
  it("has at least 3 variants", () => {
    expect(Object.keys(LANDING_VARIANTS).length).toBeGreaterThanOrEqual(3);
  });

  it("each variant has the required shape", () => {
    for (const v of Object.values(LANDING_VARIANTS)) {
      expect(v.slug).toBeTruthy();
      expect(v.headline).toBeTruthy();
      expect(v.subhead).toBeTruthy();
      expect(v.ctaLabel).toBeTruthy();
      expect(v.ctaHref).toMatch(/^\//);
      expect(Array.isArray(v.bullets)).toBe(true);
      expect(v.bullets.length).toBeGreaterThanOrEqual(2);
      expect(["cinema", "kids", "creator"]).toContain(v.vibe);
    }
  });

  it("variant key matches the slug field", () => {
    for (const [key, v] of Object.entries(LANDING_VARIANTS)) {
      expect(key).toBe(v.slug);
    }
  });
});

describe("getLandingVariant", () => {
  it("returns the matching variant", () => {
    const v = getLandingVariant("kids");
    expect(v?.slug).toBe("kids");
  });

  it("returns null on unknown slug", () => {
    expect(getLandingVariant("nope")).toBeNull();
  });
});
