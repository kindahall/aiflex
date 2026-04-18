import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  getProjectById,
  listProjectsByOwner,
  updateProject,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Series management for a project. A "series" is simply a group of
 * projects sharing the same `seriesId` string. The first project to
 * set a series title generates the ID; subsequent projects can join
 * by referencing it.
 *
 * PATCH — set or update the series membership for this project.
 * GET   — list all episodes in the same series as this project.
 */

interface PatchBody {
  seriesTitle?: string;
  episodeNumber?: number;
  /** Join an existing series by ID (from another project). */
  seriesId?: string;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const project = await getProjectById(id);
    if (!project) {
      return NextResponse.json(
        { error: "Projet introuvable" },
        { status: 404 }
      );
    }
    if (project.ownerId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json()) as PatchBody;
    const patch: Record<string, unknown> = {};

    if (body.seriesId) {
      patch.seriesId = body.seriesId;
    } else if (body.seriesTitle) {
      // Create a new series ID from timestamp.
      patch.seriesId =
        project.seriesId ||
        `ser_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      patch.seriesTitle = body.seriesTitle.trim();
    }

    if (typeof body.seriesTitle === "string") {
      patch.seriesTitle = body.seriesTitle.trim();
    }

    if (typeof body.episodeNumber === "number" && body.episodeNumber > 0) {
      patch.episodeNumber = body.episodeNumber;
    }

    const updated = await updateProject(id, patch);
    return NextResponse.json({ project: updated });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await getProjectById(id);
    if (!project || !project.seriesId) {
      return NextResponse.json({ episodes: [] });
    }

    // Find all projects by the same owner with the same seriesId.
    const all = await listProjectsByOwner(project.ownerId);
    const episodes = all
      .filter((p) => p.seriesId === project.seriesId)
      .sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0))
      .map((p) => ({
        id: p.id,
        title: p.concept?.title || "Sans titre",
        episodeNumber: p.episodeNumber || 0,
        stage: p.stage,
        published: p.published && p.visibility === "public",
        sceneCount: p.scenes?.length || 0,
      }));

    return NextResponse.json({
      seriesId: project.seriesId,
      seriesTitle: project.seriesTitle || "Sans titre",
      episodes,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
