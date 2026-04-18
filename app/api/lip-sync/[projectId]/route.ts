import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyLipSyncToScene } from "@/lib/lip-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface Body {
  sceneIndex: number;
  audioUrl: string;
}

/**
 * Apply lip-sync to a single scene of a project (V8 §28.2). Owner only.
 * Long-running — caller should treat as fire-and-forget; no need to
 * await the response beyond the initial 200/error.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const body = (await req.json()) as Body;

    if (typeof body.sceneIndex !== "number" || !body.audioUrl) {
      return NextResponse.json({ error: "Champs requis" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, composition: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    if (project.ownerId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }

    const composition = project.composition as
      | { scenes: Array<{ clipUrl?: string | null }> }
      | null;
    const sceneClipUrl = composition?.scenes?.[body.sceneIndex]?.clipUrl;
    if (!sceneClipUrl) {
      return NextResponse.json(
        { error: "Scène ou clip introuvable" },
        { status: 400 }
      );
    }

    const result = await applyLipSyncToScene({
      projectId,
      sceneIndex: body.sceneIndex,
      videoUrl: sceneClipUrl,
      audioUrl: body.audioUrl,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[lip-sync]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
