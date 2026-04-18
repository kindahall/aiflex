import { NextResponse } from "next/server";
import {
  runOnboardingSequence,
  runReactivationSequence,
  runMonthlyRecap,
} from "@/lib/email-auto";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 600;

/**
 * Daily cron hub for marketing automation (V8 §27.4).
 * Auth: shared secret + IP allowlist (see lib/cron-auth.ts).
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const isFirstOfMonth = today.getUTCDate() === 1;

  const onboarding = await runOnboardingSequence(today).catch((e) => [
    { kind: "onboarding_error", failed: 1, error: String(e) },
  ]);
  const reactivation = await runReactivationSequence(today).catch((e) => ({
    kind: "reactivation_error",
    failed: 1,
    error: String(e),
  }));
  const recap = isFirstOfMonth
    ? await runMonthlyRecap(today).catch((e) => ({
        kind: "recap_error",
        failed: 1,
        error: String(e),
      }))
    : null;

  return NextResponse.json({
    runAt: today.toISOString(),
    onboarding,
    reactivation,
    recap,
  });
}

export const GET = POST;
