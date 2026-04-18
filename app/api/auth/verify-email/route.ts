import { NextResponse } from "next/server";
import { findUserById, updateUser } from "@/lib/server-db";
import { verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  token: string;
}

/**
 * Consumes an email-verification token. Idempotent: re-verifying an
 * already-verified address is a no-op (still returns ok).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const result = verifyToken(body.token, "email-verification");
    if (!result.valid) {
      return NextResponse.json(
        { error: `Lien invalide : ${result.reason}` },
        { status: 400 }
      );
    }

    const user = await findUserById(result.payload.sub);
    if (!user) {
      return NextResponse.json(
        { error: "Compte introuvable." },
        { status: 404 }
      );
    }

    if (!user.emailVerified) {
      await updateUser(user.id, {
        emailVerified: true,
        emailVerifiedAt: Date.now(),
      });
    }

    return NextResponse.json({
      ok: true,
      email: user.email,
      alreadyVerified: Boolean(user.emailVerified),
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
