import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  deleteCommentById,
  getCommentById,
  getProjectById,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete a single comment. Authorized: the comment author, the owner of
 * the film it sits under, or any platform admin. Anybody else gets 403.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const user = await requireUser();

    const project = await getProjectById(id);
    if (!project) {
      return NextResponse.json(
        { error: "Projet introuvable" },
        { status: 404 }
      );
    }

    const comment = await getCommentById(commentId);
    if (!comment || comment.projectId !== id) {
      return NextResponse.json(
        { error: "Commentaire introuvable" },
        { status: 404 }
      );
    }

    const isAuthor = comment.authorId === user.id;
    const isFilmOwner = project.ownerId === user.id;
    const isAdmin = user.role === "admin";
    if (!isAuthor && !isFilmOwner && !isAdmin) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    await deleteCommentById(commentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
