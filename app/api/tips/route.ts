import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  createTip,
  listTipsReceived,
  getTipStats,
  findUserById,
} from "@/lib/server-db";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — list tips received or stats for a creator. */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const creatorId = searchParams.get("creatorId") || user.id;
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const tipStats = await getTipStats(creatorId);
      return NextResponse.json(tipStats);
    }

    const tips = await listTipsReceived(creatorId);
    return NextResponse.json({ tips });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST — send a tip to a creator. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      toUserId: string;
      amount: number;
      message?: string;
      stripePaymentId?: string;
    };

    if (!body.toUserId || !body.amount || body.amount < 100) {
      return NextResponse.json(
        { error: "Montant minimum: 1.00€ (100 centimes)" },
        { status: 400 }
      );
    }

    if (body.toUserId === user.id) {
      return NextResponse.json(
        { error: "Impossible de s'envoyer un tip à soi-même" },
        { status: 400 }
      );
    }

    const recipient = await findUserById(body.toUserId);
    if (!recipient) {
      return NextResponse.json(
        { error: "Créateur introuvable" },
        { status: 404 }
      );
    }

    const tip = await createTip({
      fromUserId: user.id,
      toUserId: body.toUserId,
      amount: body.amount,
      currency: "eur",
      stripePaymentId: body.stripePaymentId,
      message: body.message?.trim().slice(0, 280),
    });

    // Notify the creator
    const amountFormatted = (body.amount / 100).toFixed(2);
    await notify({
      userId: body.toUserId,
      kind: "system",
      message: `${user.name} t'a envoyé un tip de ${amountFormatted}€${body.message ? ` : "${body.message.slice(0, 50)}"` : ""}`,
      href: `/u/${body.toUserId}`,
      actorId: user.id,
      actorName: user.name,
    });

    return NextResponse.json({ tip });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
