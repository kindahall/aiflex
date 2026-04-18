import { NextResponse } from "next/server";
import { cronPublishWeeklyEpisodes } from "@/lib/series-orchestrator";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Weekly cron — launches scheduled episodes of "weekly" series.
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await cronPublishWeeklyEpisodes();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[series/publish-scheduled]", err);
    return NextResponse.json({ error: "Erreur cron" }, { status: 500 });
  }
}

export const GET = POST;
