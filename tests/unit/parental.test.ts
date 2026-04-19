/**
 * Unit tests for lib/parental.ts (V8 §22.2).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  profile: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
  filmView: {
    findMany: (...a: unknown[]) => Promise<unknown[]>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  mod = await import("@/lib/parental");
});

describe("hashPin / verifyPin", () => {
  it("rejects PINs outside 4-8 digits", () => {
    expect(() => mod.hashPin("123")).toThrow();
    expect(() => mod.hashPin("123456789")).toThrow();
    expect(() => mod.hashPin("abcd")).toThrow();
  });

  it("hashes deterministically verifiable", () => {
    const hash = mod.hashPin("1234");
    expect(hash).toMatch(/^pbkdf2\$\d+\$/);
    expect(mod.verifyPin("1234", hash)).toBe(true);
    expect(mod.verifyPin("9999", hash)).toBe(false);
  });

  it("verifyPin returns false on malformed stored value", () => {
    expect(mod.verifyPin("1234", "not-a-hash")).toBe(false);
    expect(mod.verifyPin("1234", "pbkdf2$wrong$x$y")).toBe(false);
  });

  it("salt makes two hashes of the same PIN differ", () => {
    const a = mod.hashPin("1234");
    const b = mod.hashPin("1234");
    expect(a).not.toBe(b);
    expect(mod.verifyPin("1234", a)).toBe(true);
    expect(mod.verifyPin("1234", b)).toBe(true);
  });
});

describe("shouldChallengePin", () => {
  it("no challenge when no current profile", async () => {
    const r = await mod.shouldChallengePin(null, "p_target");
    expect(r.required).toBe(false);
  });

  it("no challenge when both profiles belong to different users (defensive)", async () => {
    prismaMock.profile.findUnique
      .mockResolvedValueOnce({ isChild: true, userId: "u_a" })
      .mockResolvedValueOnce({ isChild: false, userId: "u_b", parentalPin: "x" });
    const r = await mod.shouldChallengePin("p_kids", "p_other_account");
    expect(r.required).toBe(false);
  });

  it("challenges when leaving Kids → adult AND target has a PIN", async () => {
    prismaMock.profile.findUnique
      .mockResolvedValueOnce({ isChild: true, userId: "u_1" })
      .mockResolvedValueOnce({ isChild: false, userId: "u_1", parentalPin: "stored" });
    const r = await mod.shouldChallengePin("p_kids", "p_adult");
    expect(r.required).toBe(true);
    if (r.required) expect(r.profileId).toBe("p_adult");
  });

  it("no challenge when target adult has no PIN configured", async () => {
    prismaMock.profile.findUnique
      .mockResolvedValueOnce({ isChild: true, userId: "u_1" })
      .mockResolvedValueOnce({ isChild: false, userId: "u_1", parentalPin: null });
    const r = await mod.shouldChallengePin("p_kids", "p_adult_no_pin");
    expect(r.required).toBe(false);
  });
});

describe("isPastCurfew", () => {
  it("false when profile isn't a Kids profile", async () => {
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      isChild: false,
      curfewHour: 21,
    });
    expect(await mod.isPastCurfew("p_1")).toBe(false);
  });

  it("false when no curfew set", async () => {
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      isChild: true,
      curfewHour: null,
    });
    expect(await mod.isPastCurfew("p_1")).toBe(false);
  });

  it("true after curfew hour, false before", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      isChild: true,
      curfewHour: 21,
    });
    // 22:00 UTC → past 21:00 curfew
    const past = new Date(Date.UTC(2026, 3, 14, 22, 0, 0));
    expect(await mod.isPastCurfew("p_1", past)).toBe(true);
    // 18:00 UTC → before
    const before = new Date(Date.UTC(2026, 3, 14, 18, 0, 0));
    expect(await mod.isPastCurfew("p_1", before)).toBe(false);
    // 03:00 UTC → still in curfew (before 06:00 next day)
    const earlyMorning = new Date(Date.UTC(2026, 3, 15, 3, 0, 0));
    expect(await mod.isPastCurfew("p_1", earlyMorning)).toBe(true);
  });

  it("ignores client tz offset for child profiles (browser spoofing)", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      isChild: true,
      curfewHour: 21,
    });
    // 19:00 UTC — client claims +120min (CEST → local 21:00) but child
    // profiles ignore browser offset, so UTC stays the anchor → not curfew.
    const utc = new Date(Date.UTC(2026, 3, 14, 19, 0, 0));
    expect(await mod.isPastCurfew("p_1", utc, 120)).toBe(false);
  });

  it("honors PARENTAL_CURFEW_TZ_OFFSET_MINUTES for child profiles", async () => {
    const prev = process.env.PARENTAL_CURFEW_TZ_OFFSET_MINUTES;
    process.env.PARENTAL_CURFEW_TZ_OFFSET_MINUTES = "120";
    vi.resetModules();
    const fresh = await import("@/lib/parental");
    prismaMock.profile.findUnique.mockResolvedValue({
      isChild: true,
      curfewHour: 21,
    });
    const utc = new Date(Date.UTC(2026, 3, 14, 19, 0, 0));
    expect(await fresh.isPastCurfew("p_1", utc, 0)).toBe(true);
    if (prev === undefined) delete process.env.PARENTAL_CURFEW_TZ_OFFSET_MINUTES;
    else process.env.PARENTAL_CURFEW_TZ_OFFSET_MINUTES = prev;
  });
});
