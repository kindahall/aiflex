import { describe, it, expect } from "vitest";
import { requiresAiWatermark } from "@/lib/watermark";

describe("requiresAiWatermark — AI Act compliance rule (V8 §19.2)", () => {
  it("TRUE for public AI-generated films", () => {
    expect(
      requiresAiWatermark({ uploadType: "ai_generated", visibility: "public" })
    ).toBe(true);
  });

  it("FALSE for private AI-generated films (not broadcast publicly)", () => {
    expect(
      requiresAiWatermark({ uploadType: "ai_generated", visibility: "private" })
    ).toBe(false);
  });

  it("FALSE for private circles (invited audience, not public)", () => {
    expect(
      requiresAiWatermark({
        uploadType: "ai_generated",
        visibility: "private_circle",
      })
    ).toBe(false);
  });

  it("FALSE for public user-uploads (not AI-generated, disclaimer would be misleading)", () => {
    expect(
      requiresAiWatermark({ uploadType: "user_upload", visibility: "public" })
    ).toBe(false);
  });

  it("FALSE when uploadType is missing (defensive — never watermark unknown content)", () => {
    expect(requiresAiWatermark({ visibility: "public" })).toBe(false);
    expect(requiresAiWatermark({ uploadType: null, visibility: "public" })).toBe(
      false
    );
  });

  it("FALSE when visibility is missing", () => {
    expect(requiresAiWatermark({ uploadType: "ai_generated" })).toBe(false);
  });

  it("isAdult does not change the rule", () => {
    // The AI Act watermark requirement is orthogonal to content rating.
    expect(
      requiresAiWatermark({
        uploadType: "ai_generated",
        visibility: "public",
        isAdult: true,
      })
    ).toBe(true);
  });
});
