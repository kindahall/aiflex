import { NextResponse } from "next/server";
import { aggregateDaily } from "@/lib/analytics";
import { verifyCronRequest } from "@/lib/cron-auth";

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
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[analytics/aggregate]", err);
    return NextResponse.json({ error: "Erreur agrégation" }, { status: 500 });
  }
}

export const GET = POST;
