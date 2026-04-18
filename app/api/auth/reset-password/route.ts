import { NextResponse } from "next/server";
import { findUserById, updateUser } from "@/lib/server-db";
import { hashPassword } from "@/lib/password";
import { verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  token: string;
  password: string;
}

/**
 * Consumes a password-reset token and applies the new password.
 * Tokens are stateless — anyone holding a valid (signed, non-expired)
 * token can reset, so they're short-lived (1h).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.password || body.password.length < 6) {
      return NextResponse.json(
        { error: "Le mot de passe doit faire au moins 6 caractères." },
        { status: 400 }
      );
    }

    const result = verifyToken(body.token, "password-reset");
    if (!result.valid) {
      return NextResponse.json(
        { error: `Lien invalide : ${result.reason}` },
        { status: 400 }
      );
    }

    const user = await findUserById(result.payload.sub);
    if (!user || user.suspended) {
      return NextResponse.json(
        { error: "Compte introuvable ou suspendu." },
        { status: 404 }
      );
    }

    await updateUser(user.id, {
      passwordHash: await hashPassword(body.password),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
