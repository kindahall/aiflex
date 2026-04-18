import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { findUserById, getProjectById, updateProject } from "@/lib/server-db";
import type { Visibility } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  visibility: Visibility;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const project = await getProjectById(id);
    if (!project)
      return NextResponse.json(
        { error: "Projet introuvable" },
        { status: 404 }
      );
    if (project.ownerId !== user.id && user.role !== "admin")
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = (await req.json()) as Body;
    if (!["public", "private", "followers"].includes(body.visibility)) {
      return NextResponse.json(
        { error: "Visibilité invalide" },
        { status: 400 }
      );
    }

    // Must have at least a concept + scenes to share (public or followers)
    if (body.visibility !== "private" && (!project.concept || !project.scenes?.length)) {
      return NextResponse.json(
        {
          error:
            "Ton projet doit avoir au moins un concept et des scènes pour être rendu public.",
        },
        { status: 400 }
      );
    }

    // Email verification gate. Admins are exempt (they're trusted on
    // bootstrap). Users must verify before broadcasting their work to
    // the community feed; private drafts are still allowed.
    if (body.visibility !== "private" && user.role !== "admin") {
      const owner = await findUserById(user.id);
      if (!owner?.emailVerified) {
        return NextResponse.json(
          {
            error:
              "Vérifie ton adresse email avant de publier. Tu peux réenvoyer le lien depuis ton dashboard.",
            requiresEmailVerification: true,
          },
          { status: 403 }
        );
      }
    }

    const isShared = body.visibility !== "private";
    const updated = await updateProject(id, {
      visibility: body.visibility,
      published: isShared,
      publishedAt: isShared
        ? project.publishedAt ?? Date.now()
        : project.publishedAt,
    });
    return NextResponse.json({ project: updated });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
