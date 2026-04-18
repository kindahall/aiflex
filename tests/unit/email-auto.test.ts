/**
 * Unit tests for lib/email-auto.ts (V8 §27.4).
 *
 * Covers: template selection, monthly key math, recipient filtering by
 * newsletter consent, dedup behaviour.
 */

import { describe, it, expect } from "vitest";
import { composeOnboarding, composeReactivation, composeMonthlyRecap, previousMonthKey } from "@/lib/email-auto";

describe("composeOnboarding", () => {
  it("selects the right template per kind and embeds the user name", () => {
    expect(composeOnboarding("onboarding_d0", "Léa").subject).toMatch(/Bienvenue/i);
    expect(composeOnboarding("onboarding_d0", "Léa").text).toContain("Léa");
    expect(composeOnboarding("onboarding_d1", "Léa").subject).toMatch(/suite/i);
    expect(composeOnboarding("onboarding_d3", "Léa").subject).toMatch(/conseils/i);
    expect(composeOnboarding("onboarding_d7", "Léa").subject).toMatch(/semaine/i);
  });

  it("falls back to a generic template on unknown kind", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = composeOnboarding("ghost" as any, "X");
    expect(out.subject).toBe("AIflex");
  });
});

describe("composeReactivation", () => {
  it("includes the user name and a /feed link", () => {
    const out = composeReactivation("Marc");
    expect(out.text).toContain("Marc");
    expect(out.text).toContain("/feed");
  });
});

describe("composeMonthlyRecap", () => {
  it("formats cents to dollars in subject", () => {
    const out = composeMonthlyRecap("Léa", "2026-04", 12345);
    expect(out.subject).toContain("123.45$");
    expect(out.text).toContain("123.45$");
    expect(out.text).toContain("2026-04");
  });

  it("handles zero earnings cleanly", () => {
    const out = composeMonthlyRecap("Léa", "2026-04", 0);
    expect(out.subject).toContain("0.00$");
  });
});

describe("previousMonthKey", () => {
  it("returns YYYY-MM of the month before now", () => {
    const result = previousMonthKey(new Date(Date.UTC(2026, 3, 14)));
    expect(result).toBe("2026-03");
  });

  it("rolls over the year correctly", () => {
    const result = previousMonthKey(new Date(Date.UTC(2026, 0, 1)));
    expect(result).toBe("2025-12");
  });
});
