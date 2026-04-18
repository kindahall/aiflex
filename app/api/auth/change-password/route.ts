import { NextResponse } from "next/server";
import { AuthError, getCurrentUserRecord } from "@/lib/auth";
import { updateUser } from "@/lib/server-db";
import { hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  currentPassword: string;
  newPassword: string;
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUserRecord();
    if (!me) throw new AuthError("Authentification requise", 401);

    const body = (await req.json()) as Body;
    if (!body.currentPassword || !body.newPassword) {
      return NextResponse.json(
        { error: "Mot de passe actuel et nouveau requis" },
        { status: 400 }
      );
    }
    if (body.newPassword.length < 6) {
      return NextResponse.json(
        { error: "Le nouveau mot de passe doit faire au moins 6 caractères" },
        { status: 400 }
      );
    }

    const ok = await verifyPassword(me.passwordHash, body.currentPassword);
    if (!ok) {
      return NextResponse.json(
        { error: "Mot de passe actuel incorrect" },
        { status: 401 }
      );
    }

    const newHash = await hashPassword(body.newPassword);
    await updateUser(me.id, { passwordHash: newHash });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
