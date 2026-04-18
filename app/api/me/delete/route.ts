import { NextResponse } from "next/server";
import {
  AuthError,
  endSession,
  getCurrentUserRecord,
} from "@/lib/auth";
import { deleteUser } from "@/lib/server-db";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  currentPassword: string;
  confirmation: string;
}

const CONFIRMATION_WORD = "SUPPRIMER";

/**
 * Permanent self-service account deletion. Requires:
 *   1. The current password (to prove it's really the user).
 *   2. Typing the word "SUPPRIMER" verbatim (extra safety net).
 * Cascades via lib/server-db::deleteUser (sessions, projects, likes,
 * watchlist, comments, notifications, watch progress, follows are wiped).
 *
 * Admin accounts can't self-delete — use the admin panel to demote first.
 */
export async function POST(req: Request) {
  try {
    const me = await getCurrentUserRecord();
    if (!me) throw new AuthError("Authentification requise", 401);

    if (me.role === "admin") {
      return NextResponse.json(
        {
          error:
            "Les comptes administrateurs ne peuvent pas être supprimés depuis le dashboard.",
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Body;
    if (body.confirmation !== CONFIRMATION_WORD) {
      return NextResponse.json(
        { error: `Tape "${CONFIRMATION_WORD}" pour confirmer.` },
        { status: 400 }
      );
    }
    if (!body.currentPassword) {
      return NextResponse.json(
        { error: "Mot de passe requis." },
        { status: 400 }
      );
    }

    const ok = await verifyPassword(me.passwordHash, body.currentPassword);
    if (!ok) {
      return NextResponse.json(
        { error: "Mot de passe incorrect." },
        { status: 401 }
      );
    }

    // Best-effort: if the user has an active Stripe subscription, the Stripe
    // side stays until they cancel via the portal. We flag this in the
    // response so the UI can warn.
    const hadSubscription = Boolean(me.stripeSubscriptionId);

    await deleteUser(me.id);
    await endSession();

    return NextResponse.json({ ok: true, hadSubscription });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
