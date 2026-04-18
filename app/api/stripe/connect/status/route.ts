import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConnectAccountStatus } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Current Connect status for the logged-in user + a summary of their
 * CreatorPayout rows (last 12 months). Powers /dashboard/payouts.
 *
 * If no account exists yet, returns `{ onboarded: false }` so the UI can
 * render the CTA that calls /onboard.
 */
export async function GET() {
  try {
    const me = await requireUser();

    const user = await prisma.user.findUnique({
      where: { id: me.id },
      select: { stripeConnectId: true, credits: true },
    });

    const payouts = await prisma.creatorPayout.findMany({
      where: { userId: me.id },
      orderBy: [{ month: "desc" }, { payoutType: "asc" }],
      take: 48,
    });

    if (!user?.stripeConnectId) {
      return NextResponse.json({
        onboarded: false,
        connect: null,
        credits: user?.credits ?? 0,
        payouts,
      });
    }

    let connect = null;
    try {
      connect = await getConnectAccountStatus(user.stripeConnectId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[stripe/connect/status] Stripe call failed:", err);
    }

    return NextResponse.json({
      onboarded: true,
      connect,
      credits: user.credits ?? 0,
      payouts,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
