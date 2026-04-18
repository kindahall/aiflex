import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import {
  deleteUser,
  findUserById,
  toPublicUser,
  updateUser,
} from "@/lib/server-db";
import type { UserRole } from "@/lib/types";
import { logAdminAction, type AdminAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  suspended?: boolean;
  role?: UserRole;
  name?: string;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await req.json()) as PatchBody;

    const target = await findUserById(id);
    if (!target)
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );

    // Prevent an admin from removing their own admin role (lockout safety)
    if (target.id === admin.id && body.role && body.role !== "admin") {
      return NextResponse.json(
        { error: "Tu ne peux pas retirer ton propre rôle admin." },
        { status: 400 }
      );
    }
    if (target.id === admin.id && body.suspended) {
      return NextResponse.json(
        { error: "Tu ne peux pas te suspendre toi-même." },
        { status: 400 }
      );
    }

    const patch: PatchBody = {};
    if (typeof body.suspended === "boolean") patch.suspended = body.suspended;
    if (body.role === "admin" || body.role === "user") patch.role = body.role;
    if (typeof body.name === "string" && body.name.trim())
      patch.name = body.name.trim();

    const updated = await updateUser(id, patch);
    if (!updated)
      return NextResponse.json(
        { error: "Mise à jour échouée" },
        { status: 500 }
      );

    // Log each distinct mutation (suspend/unsuspend/role change) as its own
    // audit row so compliance queries stay readable.
    const actions: AdminAction[] = [];
    if (patch.suspended === true) actions.push("suspend_user");
    else if (patch.suspended === false) actions.push("unsuspend_user");
    if (patch.role === "admin" && target.role !== "admin") actions.push("promote_admin");
    if (patch.role === "user" && target.role === "admin") actions.push("demote_admin");
    for (const action of actions) {
      logAdminAction({
        adminId: admin.id,
        action,
        targetId: id,
        targetType: "user",
        metadata: { patch, before: { role: target.role, suspended: target.suspended } },
      }).catch(() => {});
    }

    return NextResponse.json({ user: toPublicUser(updated) });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (id === admin.id)
      return NextResponse.json(
        { error: "Tu ne peux pas te supprimer toi-même." },
        { status: 400 }
      );
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
