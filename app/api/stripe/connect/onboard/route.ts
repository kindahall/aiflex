import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  createOrGetConnectAccount,
  createAccountLink,
} from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start (or resume) Stripe Connect Express onboarding for the current user.
 * Returns the Account Link URL the client should redirect to.
 *
 * We pre-resolve the creator country from a `country` body param (default
 * FR) — Stripe requires this at account creation time, not later.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { country?: string };

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const accountId = await createOrGetConnectAccount(
      user.id,
      user.email,
      body.country || "FR"
    );

    const link = await createAccountLink(
      accountId,
      `${appUrl}/api/stripe/connect/refresh`,
      `${appUrl}/api/stripe/connect/refresh`
    );

    return NextResponse.json({ url: link, accountId });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[stripe/connect/onboard]", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
