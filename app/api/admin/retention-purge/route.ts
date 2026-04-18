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

  const now = Date.now();
  const cutoffs = {
    accessLog: new Date(now - 365 * 24 * 60 * 60 * 1000),
    moderationLog: new Date(now - 2 * 365 * 24 * 60 * 60 * 1000),
    dmcaNotice: new Date(now - 3 * 365 * 24 * 60 * 60 * 1000),
    adminAuditLog: new Date(now - 2 * 365 * 24 * 60 * 60 * 1000),
  };

  const result: Record<string, number | string> = {
    cutoffs: JSON.stringify({
      accessLog: cutoffs.accessLog.toISOString().slice(0, 10),
      moderationLog: cutoffs.moderationLog.toISOString().slice(0, 10),
      dmcaNotice: cutoffs.dmcaNotice.toISOString().slice(0, 10),
      adminAuditLog: cutoffs.adminAuditLog.toISOString().slice(0, 10),
    }),
  };

  // Each delete is independent — one failure shouldn't stop the others.
  try {
    const r = await prisma.accessLog.deleteMany({
      where: { createdAt: { lt: cutoffs.accessLog } },
    });
    result.accessLog = r.count;
  } catch (err) {
    result.accessLog = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    const r = await prisma.moderationLog.deleteMany({
      where: { createdAt: { lt: cutoffs.moderationLog } },
    });
    result.moderationLog = r.count;
  } catch (err) {
    result.moderationLog = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    const r = await prisma.dMCANotice.deleteMany({
      where: { createdAt: { lt: cutoffs.dmcaNotice } },
    });
    result.dmcaNotice = r.count;
  } catch (err) {
    result.dmcaNotice = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    const r = await prisma.adminAuditLog.deleteMany({
      where: { createdAt: { lt: cutoffs.adminAuditLog } },
    });
    result.adminAuditLog = r.count;
  } catch (err) {
    result.adminAuditLog = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json(result);
}

export const GET = POST;
