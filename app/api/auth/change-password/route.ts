import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AuthError, getCurrentUserRecord, SESSION_COOKIE } from "@/lib/auth";
import { deleteSessionsForUserExcept, updateUser } from "@/lib/server-db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { validatePasswordStrength } from "@/lib/password-policy";
import { verifyTOTP } from "@/lib/totp";
import { isLocked, recordFailure, resetFailures } from "@/lib/auth-lockout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  currentPassword: string;
  newPassword: string;
  totpCode?: string;
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUserRecord();
    if (!me) throw new AuthError("Authentification requise", 401);

    const body = (await req.json()) as Body;
    if (!body.currentPassword || !body.newPassword) {
      return NextResponse.json({ error: "Mot de passe actuel et nouveau requis" }, { status: 400 });
    }
    const pwErr = validatePasswordStrength(body.newPassword);
    if (pwErr) {
      return NextResponse.json({ error: pwErr }, { status: 400 });
    }

    const remainingLock = isLocked("change-password", me.id);
    if (remainingLock > 0) {
      return NextResponse.json(
        {
          error: `Trop de tentatives. Réessaie dans ${Math.ceil(remainingLock / 60_000)} min.`,
        },
        { status: 429 }
      );
    }

    const ok = await verifyPassword(me.passwordHash, body.currentPassword);
    if (!ok) {
      recordFailure("change-password", me.id);
      return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 401 });
    }
    resetFailures("change-password", me.id);

    // If 2FA is enabled, require a fresh TOTP on every password change.
    // Having the session cookie is NOT sufficient for such a high-value op.
    if (me.totpEnabled && me.totpSecret) {
      const code = (body.totpCode || "").trim();
      if (!code) {
        return NextResponse.json({ error: "Code 2FA requis", requires2FA: true }, { status: 401 });
      }
      const validTotp = await verifyTOTP(me.totpSecret, code);
      if (!validTotp) {
        return NextResponse.json({ error: "Code 2FA invalide" }, { status: 401 });
      }
    }

    const newHash = await hashPassword(body.newPassword);
    await updateUser(me.id, { passwordHash: newHash });

    // Revoke every other session — keep only the caller's current one.
    const jar = await cookies();
    const currentToken = jar.get(SESSION_COOKIE)?.value || "";
    if (currentToken) {
      await deleteSessionsForUserExcept(me.id, currentToken);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
