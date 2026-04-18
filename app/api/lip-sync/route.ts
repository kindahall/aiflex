import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { AuthError, requireUser } from "@/lib/auth";
import { getProjectById, updateProject } from "@/lib/server-db";
import { checkPlanAccess, planGateError } from "@/lib/plan-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  /** URL of the video to lip-sync. */
  videoUrl: string;
  /** URL of the audio to sync to. */
  audioUrl: string;
  /** Optional: projectId + sceneId to auto-update the scene. */
  projectId?: string;
  sceneId?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    // Plan check — Pro+ only
    const access = await checkPlanAccess(user.id, "lip-sync");
    if (!access.allowed) {
      return NextResponse.json(
        { error: planGateError(access.requiredPlan) },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Body;

    if (!body.videoUrl || !body.audioUrl) {
      return NextResponse.json(
        { error: "videoUrl et audioUrl requis" },
        { status: 400 }
      );
    }

    const key = process.env.FAL_KEY || "";
    if (!key) {
      return NextResponse.json(
        { error: "FAL_KEY manquant — définis-le dans .env.local." },
        { status: 503 }
      );
    }
    fal.config({ credentials: key });

    const result = await fal.subscribe("fal-ai/lipsync", {
      input: {
        video_url: body.videoUrl,
        audio_url: body.audioUrl,
      },
      logs: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = (result as any)?.data ?? result;
    const outputUrl: string | undefined =
      data?.video?.url || data?.output?.url || data?.url;

    if (!outputUrl) {
      return NextResponse.json(
        { error: "Pas de résultat retourné par le modèle lip-sync." },
        { status: 502 }
      );
    }

    // Auto-update scene if projectId/sceneId provided
    if (body.projectId && body.sceneId) {
      const project = await getProjectById(body.projectId);
      if (project && (project.ownerId === user.id || user.role === "admin")) {
        const scenes = [...(project.scenes || [])];
        const idx = scenes.findIndex((s) => s.id === body.sceneId);
        if (idx !== -1) {
          scenes[idx] = { ...scenes[idx], videoUrl: outputUrl };
          await updateProject(body.projectId, { scenes });
        }
      }
    }

    return NextResponse.json({ outputUrl });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
