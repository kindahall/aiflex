/**
 * Unit tests for lib/payouts.ts executeMonthlyTransfers (V8 §A11).
 *
 * Money flow — covers grouping per-creator, skip below-threshold, skip
 * unboarded creators, idempotency key derivation, status flip on success.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  creatorPayout: {
    findMany: (...a: unknown[]) => Promise<unknown[]>;
    updateMany: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const transferMock = vi.fn(async (_p: Record<string, unknown>) => ({
  transferId: "tr_test",
  amount: 0,
  currency: "usd",
  destination: "acct_test",
}));
vi.mock("@/lib/stripe-connect", () => ({
  createPayoutTransfer: transferMock,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  transferMock.mockClear();
  vi.resetModules();
  mod = await import("@/lib/payouts");
});

describe("executeMonthlyTransfers", () => {
  it("skips creators without a Stripe Connect account", async () => {
    prismaMock.creatorPayout.findMany.mockResolvedValueOnce([
      {
        id: "p_1",
        userId: "u_1",
        netAmount: 5000,
        user: { stripeConnectId: null },
      },
    ]);
    const r = await mod.executeMonthlyTransfers("2026-04");
    expect(r.skippedNoAccount).toBe(1);
    expect(r.creatorsPaid).toBe(0);
    expect(transferMock).not.toHaveBeenCalled();
  });

  it("skips creator bundles that are below the $10 threshold", async () => {
    prismaMock.creatorPayout.findMany.mockResolvedValueOnce([
      {
        id: "p_1",
        userId: "u_1",
        netAmount: 500, // $5 — below threshold
        user: { stripeConnectId: "acct_xyz" },
      },
    ]);
    const r = await mod.executeMonthlyTransfers("2026-04");
    expect(r.creatorsPaid).toBe(0);
    expect(transferMock).not.toHaveBeenCalled();
  });

  it("groups multiple payout rows per creator into ONE transfer", async () => {
    prismaMock.creatorPayout.findMany.mockResolvedValueOnce([
      {
        id: "p_a",
        userId: "u_1",
        netAmount: 3000,
        user: { stripeConnectId: "acct_xyz" },
      },
      {
        id: "p_b",
        userId: "u_1",
        netAmount: 2500,
        user: { stripeConnectId: "acct_xyz" },
      },
    ]);
    prismaMock.creatorPayout.updateMany.mockResolvedValueOnce({});

    const r = await mod.executeMonthlyTransfers("2026-04");
    expect(r.creatorsPaid).toBe(1);
    expect(r.totalCents).toBe(5500);
    expect(transferMock).toHaveBeenCalledTimes(1);
    expect(transferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct_xyz",
        amountCents: 5500,
        // Idempotency key is deterministic on month+user+sorted-ids
        idempotencyKey: expect.stringContaining("2026-04:u_1"),
      })
    );
  });

  it("flips matched payouts to paid + records stripePayoutId", async () => {
    prismaMock.creatorPayout.findMany.mockResolvedValueOnce([
      {
        id: "p_1",
        userId: "u_1",
        netAmount: 1500,
        user: { stripeConnectId: "acct_xyz" },
      },
    ]);
    prismaMock.creatorPayout.updateMany.mockResolvedValueOnce({});

    await mod.executeMonthlyTransfers("2026-04");
    const upd = prismaMock.creatorPayout.updateMany.mock.calls[0]?.[0] as
      | {
          where: { id: { in: string[] } };
          data: { status: string; stripePayoutId: string; paidAt: Date };
        }
      | undefined;
    expect(upd?.where.id.in).toEqual(["p_1"]);
    expect(upd?.data.status).toBe("paid");
    expect(upd?.data.stripePayoutId).toBe("tr_test");
    expect(upd?.data.paidAt).toBeInstanceOf(Date);
  });

  it("counts failures without aborting the rest of the run", async () => {
    prismaMock.creatorPayout.findMany.mockResolvedValueOnce([
      {
        id: "p_1",
        userId: "u_1",
        netAmount: 1500,
        user: { stripeConnectId: "acct_x" },
      },
      {
        id: "p_2",
        userId: "u_2",
        netAmount: 1500,
        user: { stripeConnectId: "acct_y" },
      },
    ]);
    transferMock.mockRejectedValueOnce(new Error("Stripe down"));
    transferMock.mockResolvedValueOnce({
      transferId: "tr_ok",
      amount: 1500,
      currency: "usd",
      destination: "acct_y",
    });
    prismaMock.creatorPayout.updateMany.mockResolvedValueOnce({});

    const r = await mod.executeMonthlyTransfers("2026-04");
    expect(r.creatorsPaid).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.totalCents).toBe(1500);
  });
});
