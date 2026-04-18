import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { findUserById } from "@/lib/server-db";
import { signToken } from "@/lib/tokens";
import { publicUrl, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-sends the email-verification link to the currently authenticated
 * user. No-op (still 200) if the address is already verified.
 *
 * Auth-required so anonymous spam isn't possible. Rate limiting is
 * handled by the global rate-limit layer (1.5) once it lands; for now
 * the user has to be logged in, which already gates abuse.
 */
export async function POST() {
  try {
    const me = await requireUser();
    const user = await findUserById(me.id);
    if (!user) {
      return NextResponse.json(
        { error: "Compte introuvable." },
        { status: 404 }
      );
    }
    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }
    const token = signToken(user.id, "email-verification", 60 * 60 * 24); // 24h
    const url = publicUrl(`/verify-email?token=${token}`);
    await sendEmail({
      to: user.email,
      subject: "AIflex — vérifie ton adresse email",
      text: `Bonjour ${user.name},

Confirme ton adresse email pour publier des films sur AIflex :
${url}

Le lien est valide 24 heures.

L'équipe AIflex`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
