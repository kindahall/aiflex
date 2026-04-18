import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { findUserById, updateUser } from "@/lib/server-db";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  newPassword: string;
}

/**
 * Admin sets a new password for any user on the platform (including other
 * admins, and themselves — though themselves should prefer the self-service
 * change-password route so the current password is re-verified).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await req.json()) as Body;

    if (!body.newPassword || body.newPassword.length < 6) {
      return NextResponse.json(
        { error: "Le mot de passe doit faire au moins 6 caractères" },
        { status: 400 }
      );
    }

    const target = await findUserById(id);
    if (!target)
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );

    const hash = await hashPassword(body.newPassword);
    await updateUser(id, { passwordHash: hash });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
