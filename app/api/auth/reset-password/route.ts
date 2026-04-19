import { NextResponse } from "next/server";
import { deleteAllSessionsForUser, findUserById, updateUser } from "@/lib/server-db";
import { hashPassword } from "@/lib/password";
import { fingerprintState, verifyToken } from "@/lib/tokens";
import { validatePasswordStrength } from "@/lib/password-policy";

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
    const pwErr = validatePasswordStrength(body.password || "");
    if (pwErr) {
      return NextResponse.json({ error: pwErr }, { status: 400 });
    }

    // First pass — decode the token to read the subject. Binding check
    // comes after we load the user, using the current password hash.
    const decoded = verifyToken(body.token, "password-reset");
    if (!decoded.valid) {
      return NextResponse.json({ error: `Lien invalide : ${decoded.reason}` }, { status: 400 });
    }

    const user = await findUserById(decoded.payload.sub);
    if (!user || user.suspended) {
      return NextResponse.json({ error: "Compte introuvable ou suspendu." }, { status: 404 });
    }

    // Single-use enforcement: the token was signed against the password hash
    // that existed when forgot-password issued it. Once the password changes,
    // the fingerprint changes, and any surviving token becomes invalid.
    const bound = verifyToken(body.token, "password-reset", {
      expectedBind: fingerprintState(user.passwordHash),
    });
    if (!bound.valid) {
      return NextResponse.json({ error: `Lien invalide : ${bound.reason}` }, { status: 400 });
    }

    await updateUser(user.id, {
      passwordHash: await hashPassword(body.password),
    });

    // Revoke every existing session — password-reset is triggered precisely
    // when the user suspects compromise. Letting stolen cookies survive the
    // reset defeats the whole purpose.
    await deleteAllSessionsForUser(user.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
