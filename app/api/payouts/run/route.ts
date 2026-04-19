import { NextResponse } from "next/server";
import { runMonthlyPayouts, previousMonthKey } from "@/lib/payouts";
import { verifyCronRequest } from "@/lib/cron-auth";
import { isKilled } from "@/lib/kill-switch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Monthly cron — computes creator payouts for the previous month.
 * Optional body: { month: "YYYY-MM" } for historical runs (idempotent).
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isKilled("payouts")) {
    return NextResponse.json({ skipped: true, reason: "FEATURE_PAYOUTS_KILL=1" }, { status: 200 });
  }

  let month = previousMonthKey();
  try {
    const body = (await req.json().catch(() => ({}))) as { month?: string };
    if (body.month && /^\d{4}-\d{2}$/.test(body.month)) {
      month = body.month;
    }
  } catch {
    // no body — use default
  }

  try {
    const result = await runMonthlyPayouts(month);
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[payouts/run]", err);
    return NextResponse.json({ error: "Erreur payouts" }, { status: 500 });
  }
}

export const GET = POST;
