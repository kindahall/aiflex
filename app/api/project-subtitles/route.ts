import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getProjectById, updateProject } from "@/lib/server-db";
import { generateSubtitlesForScene } from "@/lib/subtitles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/project-subtitles
 * Body: { projectId }
 * Auto-generates subtitles for every scene in a project using
 * rule-based dialogue/action parsing.
 * Requires auth + project ownership.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { projectId } = await req.json();

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { error: "projectId requis" },
        { status: 400 }
      );
    }

    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Projet introuvable" },
        { status: 404 }
      );
    }
    if (project.ownerId !== user.id && user.role !== "admin") {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 }
      );
    }
    if (!project.scenes || project.scenes.length === 0) {
      return NextResponse.json(
        { error: "Aucune scène dans ce projet" },
        { status: 400 }
      );
    }

    // Generate subtitles for each scene
    const updatedScenes = project.scenes.map((scene) => ({
      ...scene,
      subtitles: generateSubtitlesForScene(scene),
    }));

    await updateProject(projectId, { scenes: updatedScenes });

    const totalEntries = updatedScenes.reduce(
      (sum, s) => sum + (s.subtitles?.length || 0),
      0
    );

    return NextResponse.json({
      ok: true,
      scenesProcessed: updatedScenes.length,
      totalSubtitleEntries: totalEntries,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
