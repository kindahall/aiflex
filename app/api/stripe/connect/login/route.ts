import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLoginLink } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Return a short-lived Stripe Express dashboard login URL so the creator
 * can manage their own bank account, tax info, and payout schedule.
 */
export async function POST() {
  try {
    const me = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: me.id },
      select: { stripeConnectId: true },
    });
    if (!user?.stripeConnectId) {
      return NextResponse.json(
        { error: "Compte Stripe non configuré" },
        { status: 400 }
      );
    }
    const url = await createLoginLink(user.stripeConnectId);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
