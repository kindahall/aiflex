import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BOOST_CONFIG, type BoostType } from "@/lib/types/film";
import { createOneShotCheckout } from "@/lib/stripe-oneshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  projectId: string;
  boostType: BoostType;
}

/**
 * Start a boost purchase flow (V7 §3.5).
 *
 * Rules:
 *   - Only the owner can boost their own film.
 *   - Film must be public and ready (no point boosting a private film).
 *   - Boost type must exist in BOOST_CONFIG.
 *
 * Returns a Stripe Checkout URL. Activation happens in the webhook
 * (lib/stripe-oneshot.ts → activateBoost) once payment clears.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;

    if (!body.projectId || !body.boostType) {
      return NextResponse.json({ error: "Champs requis" }, { status: 400 });
    }
    const cfg = BOOST_CONFIG[body.boostType];
    if (!cfg) {
      return NextResponse.json({ error: "Type de boost inconnu" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: {
        id: true,
        ownerId: true,
        title: true,
        status: true,
        visibility: true,
      },
    });
    if (!project) {
      return NextResponse.json({ error: "Film introuvable" }, { status: 404 });
    }
    if (project.ownerId !== user.id) {
      return NextResponse.json(
        { error: "Tu peux seulement booster tes propres films." },
        { status: 403 }
      );
    }
    if (project.status !== "ready") {
      return NextResponse.json(
        { error: "Le film doit être prêt avant d'être boosté." },
        { status: 400 }
      );
    }
    if (project.visibility !== "public") {
      return NextResponse.json(
        { error: "Le film doit être public pour être boosté." },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const url = await createOneShotCheckout({
      kind: "boost",
      userId: user.id,
      amountCents: cfg.priceCents,
      description: `Boost ${cfg.label} — ${project.title ?? "film"}`,
      successUrl: `${appUrl}/boost/${project.id}?status=success`,
      cancelUrl: `${appUrl}/boost/${project.id}?status=cancel`,
      customerEmail: user.email,
      metadata: {
        projectId: project.id,
        boostType: body.boostType,
      },
    });

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[boost/create]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
