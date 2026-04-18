import { NextResponse } from "next/server";
import { AuthError, getCurrentUser, requireUser } from "@/lib/auth";
import {
  getProjectById,
  hasLiked,
  likeProject,
  unlikeProject,
} from "@/lib/server-db";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Likes for a project. Only works on projects that are published & public —
 * we don't expose engagement on private drafts.
 *
 * GET    -> { liked: boolean, count: number }   (works for anonymous viewers)
 * POST   -> like (auth required)
 * DELETE -> unlike (auth required)
 */

async function loadPublic(id: string) {
  const project = await getProjectById(id);
  if (!project || !project.published || project.visibility !== "public") {
    throw new AuthError("Film introuvable", 404);
  }
  return project;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await loadPublic(id);
    const user = await getCurrentUser();
    const liked = user ? await hasLiked(user.id, id) : false;
    return NextResponse.json({ liked, count: project.likes || 0 });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await loadPublic(id);
    const user = await requireUser();
    const result = await likeProject(user.id, id);
    // Fire-and-forget notification to the film owner.
    notify({
      userId: project.ownerId,
      kind: "like",
      message: `${user.name} a aimé « ${project.concept?.title || "ton film"} »`,
      href: `/watch/${id}`,
      actorId: user.id,
      actorName: user.name,
      projectId: id,
    }).catch((e) => console.error("[notification] failed:", e));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await loadPublic(id);
    const user = await requireUser();
    const result = await unlikeProject(user.id, id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
