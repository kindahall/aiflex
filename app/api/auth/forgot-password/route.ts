import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/server-db";
import { signToken } from "@/lib/tokens";
import { publicUrl, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email: string;
}

/**
 * Initiates a password reset. Always returns 200 with a generic message
 * — never reveals whether an account exists at the given address (no
 * user enumeration). The work happens in the background.
 *
 * Token TTL: 1 hour. Tokens are stateless HMAC, so no DB cleanup needed.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = body.email?.trim().toLowerCase() || "";

    // Always pretend it worked. Tiny artificial delay to mask the
    // "did the email exist?" timing side-channel.
    const work = (async () => {
      if (!email) return;
      const user = await findUserByEmail(email);
      if (!user || user.suspended) return;
      const token = signToken(user.id, "password-reset", 60 * 60); // 1h
      const url = publicUrl(`/reset-password?token=${token}`);
      await sendEmail({
        to: user.email,
        subject: "AIflex — réinitialise ton mot de passe",
        text: `Bonjour ${user.name},

Quelqu'un (probablement toi) a demandé la réinitialisation du mot de passe associé à cette adresse.

Clique sur ce lien pour choisir un nouveau mot de passe :
${url}

Le lien est valide 1 heure. Si tu n'es pas à l'origine de cette demande, ignore ce message — ton compte reste intact.

L'équipe AIflex`,
      });
    })();

    // Don't await — the response is the same either way.
    work.catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[forgot-password] background work failed:", err);
    });

    return NextResponse.json({
      ok: true,
      message:
        "Si un compte existe avec cette adresse, un lien de réinitialisation vient d'être envoyé.",
    });
  } catch {
    // Same generic answer on parse errors — same anti-enumeration logic.
    return NextResponse.json({
      ok: true,
      message:
        "Si un compte existe avec cette adresse, un lien de réinitialisation vient d'être envoyé.",
    });
  }
}
