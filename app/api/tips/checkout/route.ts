import { NextResponse } from "next/server";
import { isKilled } from "@/lib/kill-switch";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOneShotCheckout } from "@/lib/stripe-oneshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_AMOUNTS = new Set([100, 300, 500, 1000]); // $1, $3, $5, $10
const MAX_CUSTOM = 10_000; // $100 cap on custom amounts
const MIN_CUSTOM = 100; // $1 minimum

interface Body {
  toUserId: string;
  amountCents: number;
  message?: string;
  /** Optional film context for the receiver to know which film triggered the tip. */
  projectId?: string;
}

/**
 * Create a Stripe Checkout for a creator tip (V8 §21.1).
 *
 * Rails:
 *   - Predefined amounts $1/$3/$5/$10 OR a custom amount $1-$100.
 *   - 90% to creator (split happens at payout time via Stripe Connect),
 *     10% to AIflex. We don't model the split here — `lib/stripe-oneshot`
 *     just records the Tip on webhook; the periodic creator payout pulls
 *     the right share.
 *   - Self-tipping rejected upfront.
 */
export async function POST(req: Request) {
  try {
    if (isKilled("tips")) {
      return NextResponse.json({ error: "Tips temporairement désactivés." }, { status: 503 });
    }
    const user = await requireUser();
    const body = (await req.json()) as Body;

    if (!body.toUserId || typeof body.amountCents !== "number") {
      return NextResponse.json({ error: "Champs requis" }, { status: 400 });
    }
    if (body.toUserId === user.id) {
      return NextResponse.json({ error: "Tu ne peux pas te tipper toi-même" }, { status: 400 });
    }
    const amount = Math.floor(body.amountCents);
    const isPreset = ALLOWED_AMOUNTS.has(amount);
    const isValidCustom = amount >= MIN_CUSTOM && amount <= MAX_CUSTOM;
    if (!isPreset && !isValidCustom) {
      return NextResponse.json(
        { error: "Montant invalide (1$ minimum, 100$ maximum)" },
        { status: 400 }
      );
    }

    const receiver = await prisma.user.findUnique({
      where: { id: body.toUserId },
      select: { id: true, name: true, suspended: true },
    });
    if (!receiver || receiver.suspended) {
      return NextResponse.json({ error: "Créateur introuvable ou suspendu" }, { status: 404 });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
    const successPath = body.projectId
      ? `/watch/${body.projectId}?tip=success`
      : `/u/${body.toUserId}?tip=success`;
    const cancelPath = body.projectId
      ? `/watch/${body.projectId}?tip=cancel`
      : `/u/${body.toUserId}?tip=cancel`;

    const url = await createOneShotCheckout({
      kind: "tip",
      userId: user.id,
      amountCents: amount,
      description: `Tip à ${receiver.name}`,
      successUrl: `${appUrl}${successPath}`,
      cancelUrl: `${appUrl}${cancelPath}`,
      customerEmail: user.email,
      metadata: {
        fromUserId: user.id,
        toUserId: body.toUserId,
        amountCents: String(amount),
        ...(body.message
          ? {
              // Strip control characters + angle brackets to neutralize
              // any XSS attempt on the consumer side (notification, email).
              message: body.message.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, 200),
            }
          : {}),
      },
    });

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[tips/checkout]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
