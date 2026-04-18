import { NextResponse } from "next/server";
import { sendParentWeeklyRecap } from "@/lib/parental";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 600;

/**
 * Weekly Kids recap to parents (V8 §22.2). Auth: shared secret + IP allowlist.
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendParentWeeklyRecap();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[parental-recap]", err);
    return NextResponse.json({ error: "Erreur cron" }, { status: 500 });
  }
}

export const GET = POST;
