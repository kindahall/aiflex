import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  listUserCollaborations,
  getCollaboratorRole,
  findUserById,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Projects the current user has been invited to collaborate on (role:
 * viewer or editor). Distinct from /api/projects which only returns
 * projects *owned* by the user.
 */
export async function GET() {
  try {
    const me = await requireUser();
    const projects = await listUserCollaborations(me.id);

    const items = await Promise.all(
      projects.map(async (p) => {
        const [role, owner] = await Promise.all([
          getCollaboratorRole(p.id, me.id),
          findUserById(p.ownerId),
        ]);
        return {
          id: p.id,
          title: p.concept?.title || "Projet sans titre",
          coverUrl: p.coverUrl || p.scenes?.[0]?.imageUrl,
          stage: p.stage,
          role,
          ownerName: owner?.name || "Créateur",
          ownerId: p.ownerId,
          updatedAt: p.updatedAt,
        };
      })
    );

    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ collaborations: items });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
