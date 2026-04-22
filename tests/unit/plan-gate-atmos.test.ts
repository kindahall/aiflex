import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-db", () => {
  const users = new Map<string, any>();
  return {
    findUserById: vi.fn(async (id: string) => users.get(id)),
    __users: users,
  };
});

import { checkPlanAccess } from "@/lib/plan-gate";
// The mock instance exposes an internal `__users` map for the tests to
// seed directly without touching the real DB.
import * as serverDb from "@/lib/server-db";

const seedUsers = (serverDb as unknown as { __users: Map<string, any> }).__users;

/**
 * Wave 11.4 — the "atmos-real" feature gate. Must route to Studio+ and
 * bypass for admins, matching the structure used for "series-create" /
 * "sequel-create". A regression here would either open free-tier cloud
 * Atmos (cost leak) or block admins (support pain).
 */
describe("plan-gate: atmos-real", () => {
  beforeEach(() => {
    seedUsers.clear();
  });

  it("allows admins regardless of stored plan", async () => {
    seedUsers.set("u-admin", {
      id: "u-admin",
      role: "admin",
      plan: "free",
    });
    const res = await checkPlanAccess("u-admin", "atmos-real");
    expect(res.allowed).toBe(true);
  });

  it("blocks Free users", async () => {
    seedUsers.set("u-free", {
      id: "u-free",
      role: "user",
      plan: "free",
    });
    const res = await checkPlanAccess("u-free", "atmos-real");
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.requiredPlan).toBe("studio");
      expect(res.currentPlan).toBe("free");
    }
  });

  it("blocks Pro users", async () => {
    seedUsers.set("u-pro", {
      id: "u-pro",
      role: "user",
      plan: "pro",
    });
    const res = await checkPlanAccess("u-pro", "atmos-real");
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.requiredPlan).toBe("studio");
      expect(res.currentPlan).toBe("pro");
    }
  });

  it("allows Studio users", async () => {
    seedUsers.set("u-studio", {
      id: "u-studio",
      role: "user",
      plan: "studio",
    });
    const res = await checkPlanAccess("u-studio", "atmos-real");
    expect(res.allowed).toBe(true);
  });

  it("allows Family users (same rank as Studio)", async () => {
    seedUsers.set("u-family", {
      id: "u-family",
      role: "user",
      plan: "family",
    });
    const res = await checkPlanAccess("u-family", "atmos-real");
    expect(res.allowed).toBe(true);
  });

  it("blocks expired paid plans", async () => {
    seedUsers.set("u-lapsed", {
      id: "u-lapsed",
      role: "user",
      plan: "studio",
      planExpiresAt: Date.now() - 86_400_000,
    });
    const res = await checkPlanAccess("u-lapsed", "atmos-real");
    expect(res.allowed).toBe(false);
  });
});
