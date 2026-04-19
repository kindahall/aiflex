import { NextResponse } from "next/server";
import { aggregateDaily } from "@/lib/analytics";
import { verifyCronRequest } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Daily cron — aggregates yesterday's views into DailyFilmStats (V8 §23.1).
 * Optional body: `{ date: "YYYY-MM-DD" }` to backfill a specific day.
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let date: Date | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { date?: string };
    if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      date = new Date(`${body.date}T00:00:00Z`);
    }
  } catch {
    /* no body */
  }

  try {
    const result = await aggregateDaily(date);

    // Refresh the materialized views populated by the
    // 20260419120000_pgvector_indexes_and_matviews migration. Best-effort:
    // if the function isn't present (older DB), skip silently so the daily
    // aggregate still completes.
    let matviewsRefreshed = false;
    try {
      await prisma.$executeRawUnsafe("SELECT refresh_analytics_matviews()");
      matviewsRefreshed = true;
    } catch (err) {
      log.warn("analytics.matview.refresh failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ ...result, matviewsRefreshed });
  } catch (err) {
    log.error("analytics.aggregate failed", err);
    return NextResponse.json({ error: "Erreur agrégation" }, { status: 500 });
  }
}

export const GET = POST;
