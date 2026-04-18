import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOneShotCheckout } from "@/lib/stripe-oneshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  projectId: string;
}

/**
 * Pay-per-view checkout (V8 §21.2).
 *
 * Rejects:
 *   - Films without a `ppvPrice` configured.
 *   - Users who already own this PPV (idempotency on PpvPurchase).
 *
 * Webhook activation handled in `lib/stripe-oneshot.ts → activatePpv`.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;

    if (!body.projectId) {
      return NextResponse.json({ error: "projectId requis" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: {
        id: true,
        title: true,
        ppvPrice: true,
        status: true,
        visibility: true,
      },
    });
    if (!project) {
      return NextResponse.json({ error: "Film introuvable" }, { status: 404 });
    }
    if (!project.ppvPrice || project.ppvPrice <= 0) {
      return NextResponse.json(
        { error: "Ce film n'est pas en pay-per-view." },
        { status: 400 }
      );
    }
    if (project.status !== "ready" || project.visibility !== "public") {
      return NextResponse.json(
        { error: "Film non disponible." },
        { status: 400 }
      );
    }

    // Idempotency: already purchased?
    const existing = await prisma.ppvPurchase.findUnique({
      where: { userId_projectId: { userId: user.id, projectId: project.id } },
    });
    if (existing) {
      return NextResponse.json(
        {
          alreadyOwned: true,
          watchUrl: `/watch/${project.id}`,
        },
        { status: 200 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const url = await createOneShotCheckout({
      kind: "ppv",
      userId: user.id,
      amountCents: project.ppvPrice,
      description: `Accès PPV — ${project.title ?? "film"}`,
      successUrl: `${appUrl}/watch/${project.id}?ppv=success`,
      cancelUrl: `${appUrl}/watch/${project.id}?ppv=cancel`,
      customerEmail: user.email,
      metadata: {
        projectId: project.id,
        amountCents: String(project.ppvPrice),
      },
    });

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[ppv/checkout]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
