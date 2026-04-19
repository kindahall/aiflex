import "server-only";
import { prisma } from "./prisma";

/**
 * Admin audit log helper (V8 §19.6).
 *
 * Every mutating action taken from an admin route MUST call `logAdminAction`
 * so we can answer "who approved/rejected/suspended what and when" — both
 * for legal defensibility (DMCA counter-claims, GDPR inquiries) and for
 * internal review of moderation consistency.
 *
 * Retention: 2 years minimum. Purge handled separately by the log retention
 * cron (V8 §26.4).
 */

export type AdminAction =
  | "approve_film"
  | "reject_film"
  | "suspend_user"
  | "unsuspend_user"
  | "promote_admin"
  | "demote_admin"
  | "delete_comment"
  | "delete_film"
  | "disavow_sequel"
  | "dismiss_report"
  | "action_report"
  | "update_settings"
  | "issue_refund"
  | "issue_credit"
  | "dmca_action"
  | "review_reset";

export type AdminTargetType =
  | "film"
  | "series"
  | "user"
  | "sequel"
  | "report"
  | "comment"
  | "payout"
  | "campaign"
  | "settings"
  | "dmca";

export interface LogAdminActionInput {
  adminId: string;
  action: AdminAction;
  targetId: string;
  targetType: AdminTargetType;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  /** UA string of the admin's browser, truncated to 400 chars. */
  userAgent?: string;
}

/**
 * Write an admin audit row. Never throws — audit failures must not block
 * the admin action itself, but they ARE logged to stderr so Sentry can
 * surface them.
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        targetId: input.targetId,
        targetType: input.targetType,
        metadata: (input.metadata ?? null) as unknown as object,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent?.slice(0, 400),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to write AdminAuditLog:", err);
  }
}

/**
 * Read recent audit entries, optionally filtered. Used by /admin/audit page.
 */
export async function listAdminActions(params: {
  adminId?: string;
  targetType?: AdminTargetType;
  targetId?: string;
  since?: Date;
  limit?: number;
}) {
  return prisma.adminAuditLog.findMany({
    where: {
      adminId: params.adminId,
      targetType: params.targetType,
      targetId: params.targetId,
      createdAt: params.since ? { gte: params.since } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 100,
    include: {
      admin: { select: { id: true, email: true, name: true } },
    },
  });
}
