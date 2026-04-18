import { NextResponse } from "next/server";
import { cronAdvanceAllJobs } from "@/lib/agent";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// This endpoint must never be cached by the CDN
export const revalidate = 0;

/**
 * Called every 5 minutes by node-cron (V7 §17 #31 / V8 §A9).
 * Auth: shared secret header + optional IP allowlist, see lib/cron-auth.ts.
 */
export async function POST(req: Request) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await cronAdvanceAllJobs();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[agent/cron-check]", err);
    return NextResponse.json({ error: "Erreur cron" }, { status: 500 });
  }
}

// Also allow GET for convenience when scheduling via some cron providers
export const GET = POST;
