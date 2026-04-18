import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Like / unlike a comment (V8 §24.1). Backed by the dedicated CommentLike
 * model with `(userId, commentId)` unique key — idempotent on POST.
 */

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!comment) {
      return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });
    }

    try {
      await prisma.commentLike.create({
        data: { userId: user.id, commentId: id },
      });
    } catch {
      // Unique violation → already liked, idempotent success
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await prisma.commentLike
      .delete({
        where: { userId_commentId: { userId: user.id, commentId: id } },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
