import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Retention purge cron (V8 §26.4).
 *
 * Removes records older than the legal retention windows defined in
 * the privacy policy & jurisprudence:
 *
 *   AccessLog       1 year   (LCEN FR — connection logs)
 *   ModerationLog   2 years  (moderation traceability)
 *   DMCANotice      3 years  (copyright disputes statute of limitations)
 *   AdminAuditLog   2 years  (admin action accountability)
 *
 * NOT touched:
 *   Stripe-linked tables (Subscription, CreatorPayout, FilmBoost,
 *   PpvPurchase, Tip) — French commercial code requires 10-year retention
 *   for accounting records. A separate process handles the eventual purge
 *   beyond that window.
 *
 * Auth via shared CRON_SECRET (same pattern as the other cron endpoints).
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Default to dry-run — destructive retention deletion has to be
  // explicitly opted into with `?apply=1`. Operators who schedule this
  // from cron must pass it on every run.
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("apply") !== "1";

  const now = Date.now();
  const cutoffs = {
    accessLog: new Date(now - 365 * 24 * 60 * 60 * 1000),
    moderationLog: new Date(now - 2 * 365 * 24 * 60 * 60 * 1000),
    dmcaNotice: new Date(now - 3 * 365 * 24 * 60 * 60 * 1000),
    adminAuditLog: new Date(now - 2 * 365 * 24 * 60 * 60 * 1000),
  };

  const result: Record<string, number | string | boolean> = {
    dryRun,
    cutoffs: JSON.stringify({
      accessLog: cutoffs.accessLog.toISOString().slice(0, 10),
      moderationLog: cutoffs.moderationLog.toISOString().slice(0, 10),
      dmcaNotice: cutoffs.dmcaNotice.toISOString().slice(0, 10),
      adminAuditLog: cutoffs.adminAuditLog.toISOString().slice(0, 10),
    }),
  };

  async function countOrDelete(
    label: string,
    countFn: () => Promise<number>,
    deleteFn: () => Promise<{ count: number }>
  ): Promise<void> {
    try {
      if (dryRun) {
        result[label] = await countFn();
      } else {
        const r = await deleteFn();
        result[label] = r.count;
      }
    } catch (err) {
      result[label] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  await countOrDelete(
    "accessLog",
    () => prisma.accessLog.count({ where: { createdAt: { lt: cutoffs.accessLog } } }),
    () => prisma.accessLog.deleteMany({ where: { createdAt: { lt: cutoffs.accessLog } } })
  );
  await countOrDelete(
    "moderationLog",
    () =>
      prisma.moderationLog.count({
        where: { createdAt: { lt: cutoffs.moderationLog } },
      }),
    () =>
      prisma.moderationLog.deleteMany({
        where: { createdAt: { lt: cutoffs.moderationLog } },
      })
  );
  await countOrDelete(
    "dmcaNotice",
    () =>
      prisma.dMCANotice.count({
        where: { createdAt: { lt: cutoffs.dmcaNotice } },
      }),
    () =>
      prisma.dMCANotice.deleteMany({
        where: { createdAt: { lt: cutoffs.dmcaNotice } },
      })
  );
  await countOrDelete(
    "adminAuditLog",
    () =>
      prisma.adminAuditLog.count({
        where: { createdAt: { lt: cutoffs.adminAuditLog } },
      }),
    () =>
      prisma.adminAuditLog.deleteMany({
        where: { createdAt: { lt: cutoffs.adminAuditLog } },
      })
  );

  return NextResponse.json(result);
}

export const GET = POST;
