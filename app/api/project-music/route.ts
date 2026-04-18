import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { AuthError, requireUser } from "@/lib/auth";
import { getProjectById, updateProject } from "@/lib/server-db";
import { findMusicStyle, MUSIC_STYLES } from "@/lib/music-styles";
import { checkPlanAccess, planGateError } from "@/lib/plan-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  projectId: string;
  style?: string;
  mood?: string;
  durationSec?: number;
}

export async function POST(req: Request) {
  let parsedProjectId: string | undefined;
  try {
    const user = await requireUser();

    // Plan check — Pro+ only
    const access = await checkPlanAccess(user.id, "music");
    if (!access.allowed) {
      return NextResponse.json(
        { error: planGateError(access.requiredPlan) },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Body;
    parsedProjectId = body.projectId;

    if (!body.projectId) {
      return NextResponse.json(
        { error: "projectId requis" },
        { status: 400 }
      );
    }

    // Load project + ownership check
    const project = await getProjectById(body.projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Projet introuvable" },
        { status: 404 }
      );
    }
    if (project.ownerId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const falKey = process.env.FAL_KEY || "";
    if (!falKey) {
      return NextResponse.json(
        { error: "FAL_KEY manquant - definis-le dans .env.local." },
        { status: 503 }
      );
    }
    fal.config({ credentials: falKey });

    // Build music prompt from project context + user style choice
    const styleOption = findMusicStyle(body.style || "cinematic") || MUSIC_STYLES[0];
    const projectMood = body.mood || project.tone || "";
    const projectGenre = project.genre || "";
    const conceptTitle = project.concept?.title || "";

    const prompt = [
      styleOption.prompt,
      projectMood && `${projectMood} mood`,
      projectGenre && `${projectGenre} genre`,
      conceptTitle && `for a film called "${conceptTitle}"`,
      "instrumental, no vocals, high quality, professional mixing",
    ]
      .filter(Boolean)
      .join(", ");

    const durationSec = Math.min(180, Math.max(30, body.durationSec || 60));

    // Mark project as pending
    await updateProject(body.projectId, {
      audioTrackStatus: "pending" as const,
    });

    // Call fal.ai stable-audio model
    const result = await fal.subscribe("fal-ai/stable-audio", {
      input: {
        prompt,
        seconds_total: durationSec,
        steps: 100,
      },
      logs: false,
    });

    // Parse response — fal.ai stable-audio returns { audio_file: { url } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = (result as any)?.data ?? result;
    const audioUrl: string | undefined =
      data?.audio_file?.url ||
      data?.audio?.url ||
      data?.output?.url ||
      data?.url;

    if (!audioUrl) {
      await updateProject(body.projectId, {
        audioTrackStatus: "error" as const,
      });
      return NextResponse.json(
        { error: "Le modele n'a pas retourne d'URL audio. Reponse inattendue." },
        { status: 500 }
      );
    }

    // Save to project
    await updateProject(body.projectId, {
      audioTrackUrl: audioUrl,
      audioTrackStatus: "ready" as const,
    });

    return NextResponse.json({
      audioTrackUrl: audioUrl,
      projectId: body.projectId,
      style: styleOption.id,
      durationSec,
    });
  } catch (err) {
    // Best-effort: mark as error
    if (parsedProjectId) {
      try {
        await updateProject(parsedProjectId, {
          audioTrackStatus: "error" as const,
        });
      } catch {
        // ignore
      }
    }

    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
