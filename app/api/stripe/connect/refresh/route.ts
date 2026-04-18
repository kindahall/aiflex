import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe redirects creators back here after they close (or complete) the
 * hosted onboarding flow. We simply redirect them to /dashboard/payouts
 * which reads the account status live.
 *
 * No params to validate — Stripe appends nothing to the URL. The status
 * page fetches /api/stripe/connect/status on mount and shows a proper
 * summary.
 */
export async function GET() {
  const user = await getCurrentUser();
  const target = user ? "/dashboard/payouts" : "/login?redirect=/dashboard/payouts";
  return NextResponse.redirect(new URL(target, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
}
