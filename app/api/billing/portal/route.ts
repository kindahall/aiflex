import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { createPortalSession, isStripeConfigured } from "@/lib/stripe";
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
    const record = await findUserById(user.id);

    if (!record?.stripeCustomerId) {
      return NextResponse.json(
        { error: "Aucun abonnement actif." },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const returnUrl = `${origin}/dashboard/billing`;

    const url = await createPortalSession(record.stripeCustomerId, returnUrl);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
