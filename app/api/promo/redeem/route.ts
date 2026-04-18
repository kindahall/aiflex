import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  code: string;
}

/**
 * Promo code redemption (V8 §21.3).
 *
 * Three code types:
 *   - "discount"   : percentage off — applied at next checkout (returned)
 *   - "free_month" : adds `value` months to the user's planExpiresAt
 *   - "referral"   : doesn't redeem here — baked into referral flow
 *
 * Returns the redemption outcome to the caller; the Stripe checkout flow
 * reads this server-side to apply the discount when generating the
 * Checkout Session.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;
    const code = (body.code || "").trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: "Code requis" }, { status: 400 });
    }

    const promo = await prisma.promoCode.findUnique({ where: { code } });
    if (!promo) {
      return NextResponse.json({ error: "Code inconnu" }, { status: 404 });
    }
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      return NextResponse.json({ error: "Code expiré" }, { status: 410 });
    }
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
      return NextResponse.json({ error: "Code épuisé" }, { status: 410 });
    }

    // Apply based on type
    if (promo.type === "free_month") {
      const monthsToAdd = Math.max(1, promo.value);
      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentUser: any = await prisma.user.findUnique({
        where: { id: user.id },
        select: { planExpiresAt: true },
      });
      const base = currentUser?.planExpiresAt && currentUser.planExpiresAt > now
        ? currentUser.planExpiresAt
        : now;
      const newExpiry = new Date(base);
      newExpiry.setUTCMonth(newExpiry.getUTCMonth() + monthsToAdd);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { planExpiresAt: newExpiry },
        }),
        prisma.promoCode.update({
          where: { code },
          data: { usedCount: { increment: 1 } },
        }),
      ]);
      return NextResponse.json({
        type: "free_month",
        monthsAdded: monthsToAdd,
        planExpiresAt: newExpiry.toISOString(),
      });
    }

    if (promo.type === "discount") {
      // Don't consume the code yet — it's applied at checkout time. The
      // client just receives the percentage to display a "your code is
      // valid for X% off" preview.
      return NextResponse.json({
        type: "discount",
        percent: promo.value,
        code: promo.code,
      });
    }

    return NextResponse.json({ error: "Type de code non supporté ici" }, { status: 400 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[promo/redeem]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
