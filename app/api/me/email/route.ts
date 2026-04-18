import { NextResponse } from "next/server";
import { AuthError, getCurrentUserRecord } from "@/lib/auth";
import { findUserByEmail, updateUser } from "@/lib/server-db";
import { verifyPassword } from "@/lib/password";
import { signToken } from "@/lib/tokens";
import { publicUrl, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  newEmail: string;
  currentPassword: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Self-service email change. Requires current password. Resets
 * `emailVerified` and sends a new verification link to the new address.
 */
export async function POST(req: Request) {
  try {
    const me = await getCurrentUserRecord();
    if (!me) throw new AuthError("Authentification requise", 401);

    const body = (await req.json()) as Body;
    const newEmail = (body.newEmail || "").trim().toLowerCase();

    if (!EMAIL_RE.test(newEmail)) {
      return NextResponse.json(
        { error: "Adresse email invalide." },
        { status: 400 }
      );
    }
    if (newEmail === me.email) {
      return NextResponse.json(
        { error: "C'est déjà ton adresse actuelle." },
        { status: 400 }
      );
    }
    if (!body.currentPassword) {
      return NextResponse.json(
        { error: "Mot de passe requis pour confirmer." },
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

    const existing = await findUserByEmail(newEmail);
    if (existing) {
      return NextResponse.json(
        { error: "Cette adresse est déjà utilisée." },
        { status: 409 }
      );
    }

    await updateUser(me.id, {
      email: newEmail,
      emailVerified: false,
      emailVerifiedAt: undefined,
    });

    const token = signToken(me.id, "email-verification", 60 * 60 * 24);
    const url = publicUrl(`/verify-email?token=${token}`);
    try {
      await sendEmail({
        to: newEmail,
        subject: "AIflex — confirme ta nouvelle adresse email",
        text: `Bonjour ${me.name},

Tu viens de changer l'adresse email de ton compte AIflex. Confirme-la en cliquant sur le lien :
${url}

Le lien est valide 24 heures. Si ce n'est pas toi, reconnecte-toi et change le mot de passe.

L'équipe AIflex`,
      });
    } catch {
      // Email delivery failure shouldn't revert the change — user can
      // trigger a resend from the dashboard.
    }

    return NextResponse.json({ ok: true, email: newEmail });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
