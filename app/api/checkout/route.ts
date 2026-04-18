import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe";
import { PLANS, type PlanId } from "@/lib/plans";
import { findUserById } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Le paiement n'est pas encore configuré." },
        { status: 503 }
      );
    }

    const user = await requireUser();
    const body = (await req.json()) as { planId?: string; annual?: boolean };
    const planId = body.planId as PlanId;

    if (!planId || !PLANS[planId] || PLANS[planId].price === 0) {
      return NextResponse.json(
        { error: "Plan invalide." },
        { status: 400 }
      );
    }

    // Fetch full user record to check existing subscription.
    const record = await findUserById(user.id);
    if (record?.plan === planId) {
      return NextResponse.json(
        { error: "Vous êtes déjà abonné à ce plan." },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const successUrl = `${origin}/dashboard/billing?success=1`;
    const cancelUrl = `${origin}/pricing?canceled=1`;

    const url = await createCheckoutSession(
      user.id,
      planId,
      successUrl,
      cancelUrl,
      body.annual ?? false
    );

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
