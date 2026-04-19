import "server-only";
import { prisma } from "./prisma";
import { logAdminAction } from "./audit";
import { notify } from "./notify";

/**
 * Report triage + decision helpers (V8 §19.5).
 *
 * Severity ordering for the admin queue:
 *   csam        > copyright > hate > inappropriate > spam > other
 *
 * CSAM auto-workflow (zero-tolerance): the project is hidden immediately
 * when a CSAM report is filed, the reporter is notified that the report
 * was received, and an alert email is sent to the admin team. Evidence
 * (the project + the reporter context) is kept for 90 days even if the
 * report is later dismissed — see retention purge (V8 §26.4).
 */

export const REPORT_SEVERITY: Record<string, number> = {
  csam: 0, // most severe, top of queue
  copyright: 1,
  hate: 2,
  inappropriate: 3,
  spam: 4,
  other: 5,
};

export type ReportAction = "removed" | "warned" | "suspended" | "none";

/**
 * Quarantine threshold: one report is enough to *flag* a project for admin
 * review, but hiding from the public catalogue requires corroboration from
 * at least N distinct reporters. Without this, a single malicious user can
 * take any public film offline by sending a forged CSAM report.
 *
 * Admins can always force-hide from /admin/reports — this is only about
 * automatic pre-review action.
 */
const CSAM_QUARANTINE_MIN_REPORTERS = 2;

/**
 * Quarantine a project on CSAM signalement: hide from public catalogue
 * immediately IF enough distinct reporters have flagged it. Always flips
 * adminReviewStatus so the admin queue surfaces the case.
 */
export async function quarantineProjectForCsam(projectId: string): Promise<void> {
  try {
    const distinct = await prisma.report.findMany({
      where: {
        targetType: "project",
        targetId: projectId,
        reason: "csam",
      },
      select: { reporterId: true },
    });
    const uniqueReporters = new Set(distinct.map((r) => r.reporterId)).size;

    const shouldHide = uniqueReporters >= CSAM_QUARANTINE_MIN_REPORTERS;

    await prisma.project.update({
      where: { id: projectId },
      data: {
        // Flag for review on every CSAM report, regardless of count.
        adminReviewStatus: "pending_review",
        // Hide only after corroboration to prevent single-user DOS.
        ...(shouldHide ? { published: false } : {}),
      },
    });
  } catch {
    // Project may not exist (report could target a comment) — don't crash
  }
}

/**
 * Apply an admin decision to a report.
 *
 *   "removed"   → delete/hide the targeted entity
 *   "warned"    → notify the targeted user
 *   "suspended" → suspend the targeted user
 *   "none"      → dismiss without action (still recorded in audit log)
 */
export async function applyReportDecision(params: {
  reportId: string;
  adminId: string;
  action: ReportAction;
  ipAddress?: string;
}): Promise<void> {
  const report = await prisma.report.findUnique({
    where: { id: params.reportId },
  });
  if (!report) throw new Error("Report introuvable");
  if (report.status !== "pending") {
    throw new Error("Ce signalement a déjà été traité.");
  }

  switch (params.action) {
    case "removed":
      await applyRemove(report.targetType, report.targetId);
      break;
    case "warned":
      await applyWarn(report.targetType, report.targetId);
      break;
    case "suspended":
      await applySuspend(report.targetType, report.targetId);
      break;
    case "none":
      // no side effect
      break;
  }

  await prisma.report.update({
    where: { id: params.reportId },
    data: {
      status: params.action === "none" ? "dismissed" : "actioned",
      action: params.action,
      reviewedBy: params.adminId,
      reviewedAt: new Date(),
    },
  });

  await logAdminAction({
    adminId: params.adminId,
    action: params.action === "none" ? "dismiss_report" : "action_report",
    targetId: params.reportId,
    targetType: "report",
    metadata: {
      reportReason: report.reason,
      reportTargetType: report.targetType,
      reportTargetId: report.targetId,
      action: params.action,
    },
    ipAddress: params.ipAddress,
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Side-effect implementations
// ---------------------------------------------------------------------------

async function applyRemove(targetType: string, targetId: string): Promise<void> {
  if (targetType === "project") {
    await prisma.project
      .update({
        where: { id: targetId },
        data: {
          published: false,
          status: "rejected",
          adminReviewStatus: "rejected",
          isDisavowed: true,
        },
      })
      .catch(() => {});
  } else if (targetType === "comment") {
    await prisma.comment.delete({ where: { id: targetId } }).catch(() => {});
  }
  // For "user" / "sequel" targetTypes the Remove action doesn't make sense
  // — the admin should pick "suspended" or "removed" on the underlying
  // project. We log the attempt and no-op.
}

async function applyWarn(targetType: string, targetId: string): Promise<void> {
  // Resolve the user behind the target and send a system notification.
  let userId: string | null = null;
  if (targetType === "user") {
    userId = targetId;
  } else if (targetType === "project") {
    const p = await prisma.project.findUnique({
      where: { id: targetId },
      select: { ownerId: true },
    });
    userId = p?.ownerId ?? null;
  } else if (targetType === "comment") {
    const c = await prisma.comment.findUnique({
      where: { id: targetId },
      select: { authorId: true },
    });
    userId = c?.authorId ?? null;
  }
  if (!userId) return;
  await notify({
    userId,
    kind: "system",
    message:
      "⚠️ Avertissement : un de tes contenus a été signalé et examiné. Relis nos règles de la communauté.",
    href: "/legal/community-guidelines",
  }).catch(() => {});
}

async function applySuspend(targetType: string, targetId: string): Promise<void> {
  let userId: string | null = null;
  if (targetType === "user") {
    userId = targetId;
  } else if (targetType === "project") {
    const p = await prisma.project.findUnique({
      where: { id: targetId },
      select: { ownerId: true },
    });
    userId = p?.ownerId ?? null;
  }
  if (!userId) return;
  await prisma.user.update({
    where: { id: userId },
    data: { suspended: true },
  });
}

// ---------------------------------------------------------------------------
// Queue listing — ordered by severity then age
// ---------------------------------------------------------------------------

export async function listPendingReports(limit = 100) {
  const rows = await prisma.report.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      reporter: { select: { id: true, email: true, name: true } },
    },
  });
  return rows.sort((a, b) => {
    const sa = REPORT_SEVERITY[a.reason] ?? 99;
    const sb = REPORT_SEVERITY[b.reason] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}
