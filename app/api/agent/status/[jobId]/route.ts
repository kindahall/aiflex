import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll endpoint for the GenerationProgress UI (V7 §17 #22).
 * Returns: status, progress fraction, errorMessage, and (when ready) the
 * resulting projectId for navigation.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await requireUser();
    const { jobId } = await params;

    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        userId: true,
        status: true,
        errorMessage: true,
        scheduledAt: true,
        launchAt: true,
        projectId: true,
        scenarioData: true,
        characterImages: true,
        updatedAt: true,
      },
    });
    if (!job) {
      return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
    }
    if (job.userId !== user.id) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }

    // Compute progress fraction from scenarioData.scenes if we're in the
    // video-generation phase.
    let progress = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scenario = job.scenarioData as any;
    const scenes: Array<{ persistedClipUrl?: string | null }> = Array.isArray(
      scenario?.scenes
    )
      ? scenario.scenes
      : [];

    switch (job.status) {
      case "pending":
      case "scheduled":
        progress = 0;
        break;
      case "analyzing":
        progress = 0.1;
        break;
      case "scenario_ready":
      case "awaiting_validation":
        progress = 0.3;
        break;
      case "generating":
        if (scenes.length > 0) {
          const done = scenes.filter((s) => s.persistedClipUrl).length;
          progress = 0.3 + 0.6 * (done / scenes.length);
        } else {
          progress = 0.35;
        }
        break;
      case "done":
        progress = 1;
        break;
      case "error":
        progress = 0;
        break;
    }

    return NextResponse.json({
      status: job.status,
      progress,
      errorMessage: job.errorMessage,
      scheduledAt: job.scheduledAt,
      launchAt: job.launchAt,
      projectId: job.projectId,
      characterImages: job.characterImages ?? null,
      scenario: scenario ?? null,
      updatedAt: job.updatedAt,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
