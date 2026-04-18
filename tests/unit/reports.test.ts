/**
 * Unit tests for lib/reports.ts (V8 §19.5).
 *
 * Covers severity sort, the CSAM auto-quarantine, and the side-effects
 * of each ReportAction.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  project: {
    update: (...a: unknown[]) => Promise<unknown>;
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
  comment: {
    delete: (...a: unknown[]) => Promise<unknown>;
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
  user: {
    update: (...a: unknown[]) => Promise<unknown>;
  };
  report: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
    findMany: (...a: unknown[]) => Promise<unknown[]>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const auditMock = vi.fn(async (_input: Record<string, unknown>) => {});
vi.mock("@/lib/audit", () => ({ logAdminAction: auditMock }));

const notifyMock = vi.fn(async (_input: Record<string, unknown>) => {});
vi.mock("@/lib/notify", () => ({ notify: notifyMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  auditMock.mockClear();
  notifyMock.mockClear();
  vi.resetModules();
  mod = await import("@/lib/reports");
});

describe("REPORT_SEVERITY ordering", () => {
  it("CSAM is most severe (lowest number)", () => {
    expect(mod.REPORT_SEVERITY.csam).toBeLessThan(mod.REPORT_SEVERITY.copyright);
    expect(mod.REPORT_SEVERITY.csam).toBeLessThan(mod.REPORT_SEVERITY.hate);
    expect(mod.REPORT_SEVERITY.csam).toBeLessThan(mod.REPORT_SEVERITY.spam);
  });
  it("copyright outranks hate, hate outranks spam", () => {
    expect(mod.REPORT_SEVERITY.copyright).toBeLessThan(mod.REPORT_SEVERITY.hate);
    expect(mod.REPORT_SEVERITY.hate).toBeLessThan(mod.REPORT_SEVERITY.spam);
  });
});

describe("quarantineProjectForCsam", () => {
  it("hides the project (published=false, pending_review)", async () => {
    prismaMock.project.update.mockResolvedValueOnce({});
    await mod.quarantineProjectForCsam("p_1");
    const call = prismaMock.project.update.mock.calls[0]?.[0] as
      | { where: { id: string }; data: { published: boolean; adminReviewStatus: string } }
      | undefined;
    expect(call?.data.published).toBe(false);
    expect(call?.data.adminReviewStatus).toBe("pending_review");
  });

  it("never throws when the target doesn't exist", async () => {
    prismaMock.project.update.mockRejectedValueOnce(new Error("not found"));
    await expect(mod.quarantineProjectForCsam("missing")).resolves.toBeUndefined();
  });
});

describe("applyReportDecision", () => {
  it("throws when the report is missing", async () => {
    prismaMock.report.findUnique.mockResolvedValueOnce(null);
    await expect(
      mod.applyReportDecision({
        reportId: "r_1",
        adminId: "admin",
        action: "removed",
      })
    ).rejects.toThrow();
  });

  it("throws when the report is already actioned", async () => {
    prismaMock.report.findUnique.mockResolvedValueOnce({
      id: "r_1",
      status: "actioned",
      reason: "spam",
      targetType: "project",
      targetId: "p_1",
    });
    await expect(
      mod.applyReportDecision({
        reportId: "r_1",
        adminId: "admin",
        action: "none",
      })
    ).rejects.toThrow();
  });

  it("removed: hides the project + writes audit", async () => {
    prismaMock.report.findUnique.mockResolvedValueOnce({
      id: "r_1",
      status: "pending",
      reason: "copyright",
      targetType: "project",
      targetId: "p_1",
    });
    prismaMock.project.update.mockResolvedValueOnce({});
    prismaMock.report.update.mockResolvedValueOnce({});

    await mod.applyReportDecision({
      reportId: "r_1",
      adminId: "admin_1",
      action: "removed",
    });

    const projUpdate = prismaMock.project.update.mock.calls[0]?.[0] as
      | { data: { published: boolean; isDisavowed: boolean } }
      | undefined;
    expect(projUpdate?.data.published).toBe(false);
    expect(projUpdate?.data.isDisavowed).toBe(true);

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]?.[0]).toMatchObject({
      adminId: "admin_1",
      action: "action_report",
    });
  });

  it("warned: notifies the project owner", async () => {
    prismaMock.report.findUnique.mockResolvedValueOnce({
      id: "r_1",
      status: "pending",
      reason: "hate",
      targetType: "project",
      targetId: "p_1",
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      ownerId: "owner_42",
    });
    prismaMock.report.update.mockResolvedValueOnce({});

    await mod.applyReportDecision({
      reportId: "r_1",
      adminId: "admin_1",
      action: "warned",
    });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0]?.[0]).toMatchObject({
      userId: "owner_42",
      kind: "system",
    });
  });

  it("suspended: flips user.suspended for a user-targeted report", async () => {
    prismaMock.report.findUnique.mockResolvedValueOnce({
      id: "r_1",
      status: "pending",
      reason: "hate",
      targetType: "user",
      targetId: "abuser_id",
    });
    prismaMock.user.update.mockResolvedValueOnce({});
    prismaMock.report.update.mockResolvedValueOnce({});

    await mod.applyReportDecision({
      reportId: "r_1",
      adminId: "admin_1",
      action: "suspended",
    });

    const call = prismaMock.user.update.mock.calls[0]?.[0] as
      | { where: { id: string }; data: { suspended: boolean } }
      | undefined;
    expect(call?.where.id).toBe("abuser_id");
    expect(call?.data.suspended).toBe(true);
  });

  it("none: dismisses + writes dismiss_report audit", async () => {
    prismaMock.report.findUnique.mockResolvedValueOnce({
      id: "r_1",
      status: "pending",
      reason: "spam",
      targetType: "project",
      targetId: "p_1",
    });
    prismaMock.report.update.mockResolvedValueOnce({});

    await mod.applyReportDecision({
      reportId: "r_1",
      adminId: "admin_1",
      action: "none",
    });

    const reportUpdate = prismaMock.report.update.mock.calls[0]?.[0] as
      | { data: { status: string; action: string } }
      | undefined;
    expect(reportUpdate?.data.status).toBe("dismissed");
    expect(reportUpdate?.data.action).toBe("none");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "dismiss_report" })
    );
  });
});

describe("listPendingReports", () => {
  it("sorts by severity then by age", async () => {
    const now = Date.now();
    prismaMock.report.findMany.mockResolvedValueOnce([
      // intentionally inserted out-of-order
      {
        id: "r_old_spam",
        reason: "spam",
        createdAt: new Date(now - 100_000),
        reporter: {},
      },
      {
        id: "r_new_csam",
        reason: "csam",
        createdAt: new Date(now - 10_000),
        reporter: {},
      },
      {
        id: "r_old_copyright",
        reason: "copyright",
        createdAt: new Date(now - 50_000),
        reporter: {},
      },
    ]);
    const out = await mod.listPendingReports();
    expect(out.map((r: { id: string }) => r.id)).toEqual([
      "r_new_csam",
      "r_old_copyright",
      "r_old_spam",
    ]);
  });
});
