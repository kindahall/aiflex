/**
 * Integration tests for POST /api/promo/redeem (V8 §21.3).
 *
 * Validates the four happy/unhappy paths:
 *   - 404 unknown code, 410 expired/exhausted
 *   - free_month: extends planExpiresAt + bumps usedCount
 *   - discount: returns the percent without consuming the code
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  promoCode: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
  };
  user: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
  };
  $transaction: (ops: unknown[]) => Promise<unknown[]>;
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

class MockAuthError extends Error {
  public status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: "u_1",
    email: "u@x.com",
    name: "U",
    role: "user",
    plan: "free",
  })),
  AuthError: MockAuthError,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  const mod = await import("@/app/api/promo/redeem/route");
  POST = mod.POST;
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/promo/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/promo/redeem — validation", () => {
  it("400 when code missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("404 when code doesn't exist", async () => {
    prismaMock.promoCode.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req({ code: "NOPE" }));
    expect(res.status).toBe(404);
  });

  it("410 when code is expired", async () => {
    prismaMock.promoCode.findUnique.mockResolvedValueOnce({
      code: "EXP",
      type: "free_month",
      value: 1,
      maxUses: null,
      usedCount: 0,
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await POST(req({ code: "EXP" }));
    expect(res.status).toBe(410);
  });

  it("410 when code is exhausted", async () => {
    prismaMock.promoCode.findUnique.mockResolvedValueOnce({
      code: "DEAD",
      type: "discount",
      value: 20,
      maxUses: 5,
      usedCount: 5,
      expiresAt: null,
    });
    const res = await POST(req({ code: "DEAD" }));
    expect(res.status).toBe(410);
  });
});

describe("POST /api/promo/redeem — discount", () => {
  it("returns the percent + code WITHOUT consuming usedCount", async () => {
    prismaMock.promoCode.findUnique.mockResolvedValueOnce({
      code: "SUMMER20",
      type: "discount",
      value: 20,
      maxUses: 100,
      usedCount: 0,
      expiresAt: null,
    });
    const res = await POST(req({ code: "summer20" })); // case-insensitive
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("discount");
    expect(data.percent).toBe(20);
    expect(data.code).toBe("SUMMER20");
    // Discount codes are consumed at checkout, NOT here
    expect(prismaMock.promoCode.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/promo/redeem — free_month", () => {
  it("extends planExpiresAt by `value` months and bumps usedCount", async () => {
    prismaMock.promoCode.findUnique.mockResolvedValueOnce({
      code: "GIFT2",
      type: "free_month",
      value: 2,
      maxUses: 1000,
      usedCount: 0,
      expiresAt: null,
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      planExpiresAt: null,
    });
    prismaMock.$transaction.mockResolvedValueOnce([{}, {}]);

    const res = await POST(req({ code: "gift2" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("free_month");
    expect(data.monthsAdded).toBe(2);
    expect(typeof data.planExpiresAt).toBe("string");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/promo/redeem — referral type", () => {
  it("400 because referral codes are baked into the referral flow, not here", async () => {
    prismaMock.promoCode.findUnique.mockResolvedValueOnce({
      code: "REFR123",
      type: "referral",
      value: 1,
      maxUses: null,
      usedCount: 0,
      expiresAt: null,
    });
    const res = await POST(req({ code: "REFR123" }));
    expect(res.status).toBe(400);
  });
});
