/**
 * Unit tests for lib/audit.ts (V8 §19.6).
 *
 * Critical : audit logging must NEVER throw — the admin action it
 * records must always succeed regardless of audit DB health.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  adminAuditLog: {
    create: (...a: unknown[]) => Promise<unknown>;
    findMany: (...a: unknown[]) => Promise<unknown[]>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  mod = await import("@/lib/audit");
});

describe("logAdminAction", () => {
  it("writes the row with full payload", async () => {
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({});
    await mod.logAdminAction({
      adminId: "admin_1",
      action: "approve_film",
      targetId: "film_1",
      targetType: "film",
      metadata: { note: "ok" },
      ipAddress: "1.2.3.4",
    });
    const call = prismaMock.adminAuditLog.create.mock.calls[0]?.[0] as
      | {
          data: {
            adminId: string;
            action: string;
            targetId: string;
            targetType: string;
            metadata: Record<string, unknown>;
            ipAddress: string;
          };
        }
      | undefined;
    expect(call?.data.action).toBe("approve_film");
    expect(call?.data.metadata).toEqual({ note: "ok" });
    expect(call?.data.ipAddress).toBe("1.2.3.4");
  });

  it("never throws when the DB is down (fail-safe)", async () => {
    prismaMock.adminAuditLog.create.mockRejectedValueOnce(new Error("DB down"));
    await expect(
      mod.logAdminAction({
        adminId: "admin",
        action: "approve_film",
        targetId: "x",
        targetType: "film",
      })
    ).resolves.toBeUndefined();
  });

  it("accepts metadata=undefined and stores null", async () => {
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({});
    await mod.logAdminAction({
      adminId: "admin",
      action: "approve_film",
      targetId: "x",
      targetType: "film",
    });
    const call = prismaMock.adminAuditLog.create.mock.calls[0]?.[0] as
      | { data: { metadata: unknown } }
      | undefined;
    expect(call?.data.metadata).toBeNull();
  });
});

describe("listAdminActions", () => {
  it("forwards filters + caps results", async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValueOnce([]);
    await mod.listAdminActions({
      adminId: "admin_1",
      targetType: "film",
      limit: 50,
    });
    const call = prismaMock.adminAuditLog.findMany.mock.calls[0]?.[0] as
      | { where: { adminId: string; targetType: string }; take: number }
      | undefined;
    expect(call?.where.adminId).toBe("admin_1");
    expect(call?.where.targetType).toBe("film");
    expect(call?.take).toBe(50);
  });

  it("defaults limit to 100 when omitted", async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValueOnce([]);
    await mod.listAdminActions({});
    const call = prismaMock.adminAuditLog.findMany.mock.calls[0]?.[0] as
      | { take: number }
      | undefined;
    expect(call?.take).toBe(100);
  });
});
