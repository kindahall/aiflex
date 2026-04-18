import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { stripePost, isStripeConfigured } from "@/lib/stripe";
import { CREATOR_PRO_PLANS } from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  plan: keyof typeof CREATOR_PRO_PLANS;
}

/**
 * Subscribe to a Creator Pro plan (V8 §21.7).
 *
 * Uses inline Stripe `price_data` (same pattern as bundle) so no per-plan
 * Product setup is needed. Activation via webhook — metadata.kind =
 * "creator_pro" triggers `handleCreatorProCompleted`.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;
    const cfg = CREATOR_PRO_PLANS[body.plan];
    if (!cfg) {
      return NextResponse.json({ error: "Plan inconnu" }, { status: 400 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe non configuré" }, { status: 500 });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const session = await stripePost("/checkout/sessions", {
      mode: "subscription",
      success_url: `${appUrl}/dashboard/creator-plan?status=success`,
      cancel_url: `${appUrl}/dashboard/creator-plan?status=cancel`,
      customer_email: user.email,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(cfg.priceCents),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": cfg.label,
      "line_items[0][price_data][product_data][description]":
        "Quota mensuel de génération AIflex inclus",
      "metadata[kind]": "creator_pro",
      "metadata[userId]": user.id,
      "metadata[plan]": body.plan,
      client_reference_id: user.id,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[creator-plan/subscribe]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
