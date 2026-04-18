import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripePost, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Subscribe to a creator's personal bundle (V8 §21.5).
 *
 * Pricing: $4.99/month default (creator may override per-creator later
 * via a column on User; not yet exposed). Split on CreatorPayout:
 *   - 70% creator
 *   - 30% AIflex
 *
 * Payment via recurring Stripe subscription with price_data inline (no
 * Stripe Product setup required per creator). The webhook activates the
 * CreatorBundleSubscription row.
 */

const DEFAULT_PRICE_CENTS = 499; // $4.99

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: creatorId } = await params;

    if (creatorId === user.id) {
      return NextResponse.json(
        { error: "Tu ne peux pas t'abonner à ton propre bundle." },
        { status: 400 }
      );
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe non configuré" }, { status: 500 });
    }

    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { id: true, name: true, email: true, suspended: true },
    });
    if (!creator || creator.suspended) {
      return NextResponse.json(
        { error: "Créateur introuvable ou suspendu" },
        { status: 404 }
      );
    }

    // Idempotency: already subscribed?
    const existing = await prisma.creatorBundleSubscription.findUnique({
      where: {
        subscriberId_creatorId: {
          subscriberId: user.id,
          creatorId,
        },
      },
    });
    if (existing && existing.status === "active") {
      return NextResponse.json({
        alreadySubscribed: true,
        dashboardUrl: `/u/${creatorId}`,
      });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    // Build a recurring price_data on the fly — no Stripe Product needed.
    const session = await stripePost("/checkout/sessions", {
      mode: "subscription",
      success_url: `${appUrl}/u/${creatorId}?bundle=success`,
      cancel_url: `${appUrl}/u/${creatorId}?bundle=cancel`,
      customer_email: user.email,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(DEFAULT_PRICE_CENTS),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": `Bundle ${creator.name}`,
      "line_items[0][price_data][product_data][description]":
        `Accès illimité au catalogue de ${creator.name} sur AIflex`,
      "metadata[kind]": "creator_bundle",
      "metadata[subscriberId]": user.id,
      "metadata[creatorId]": creatorId,
      "metadata[priceCents]": String(DEFAULT_PRICE_CENTS),
      client_reference_id: user.id,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[bundle/subscribe]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
