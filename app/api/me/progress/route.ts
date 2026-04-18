import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  findUserById,
  getWatchProgress,
  listContinueWatching,
  upsertWatchProgress,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  → list the user's "continue watching" queue (in-progress films).
 * POST → save/update progress for a specific film.
 *
 * Progress is stored as a (lastSceneIndex, progress 0..1) pair. A
 * progress of exactly 0 or 1 means not started / fully watched — these
 * are excluded from the "continue watching" row on the home page.
 */

export async function GET() {
  try {
    const user = await requireUser();
    const items = await listContinueWatching(user.id);
    const enriched = await Promise.all(
      items.map(async (item) => {
        const owner = await findUserById(item.project.ownerId);
        return {
          projectId: item.projectId,
          lastSceneIndex: item.lastSceneIndex,
          progress: item.progress,
          updatedAt: item.updatedAt,
          title: item.project.concept?.title || "Sans titre",
          genre: item.project.genre,
          coverUrl:
            item.project.coverUrl || item.project.scenes?.[0]?.imageUrl,
          sceneCount: item.project.scenes?.length || 0,
          author:
            owner?.name ||
            item.project.author ||
            "Créateur AIflex",
        };
      })
    );
    return NextResponse.json({ items: enriched });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

interface PostBody {
  projectId: string;
  lastSceneIndex: number;
  progress: number;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as PostBody;
    if (
      !body.projectId ||
      typeof body.lastSceneIndex !== "number" ||
      typeof body.progress !== "number"
    ) {
      return NextResponse.json(
        { error: "Données manquantes" },
        { status: 400 }
      );
    }
    await upsertWatchProgress({
      userId: user.id,
      projectId: body.projectId,
      lastSceneIndex: body.lastSceneIndex,
      progress: Math.max(0, Math.min(1, body.progress)),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
