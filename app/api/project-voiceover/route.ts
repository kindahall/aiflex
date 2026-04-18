import { NextResponse } from "next/server";
import OpenAI from "openai";
import { AuthError, requireUser } from "@/lib/auth";
import { getProjectById, getSettings, updateProject } from "@/lib/server-db";
import { TTS_VOICES } from "@/lib/platform-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  projectId: string;
  voice?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;

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

    const scenes = project.scenes || [];
    if (scenes.length === 0) {
      return NextResponse.json(
        { error: "Aucune scene dans ce projet" },
        { status: 400 }
      );
    }

    // Validate voice
    const settings = await getSettings();
    const voice = body.voice || settings.defaultVoice || "nova";
    if (!TTS_VOICES.some((v) => v.id === voice)) {
      return NextResponse.json(
        { error: `Voix invalide: ${voice}` },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY manquante - definis-la dans .env.local." },
        { status: 503 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const ttsModel = settings.ttsModel === "openai-tts-1-hd" ? "tts-1-hd" : "tts-1";

    // Generate voiceover for each scene sequentially
    const updatedScenes = [...scenes];
    const results: Array<{ sceneId: string; status: string }> = [];

    for (let i = 0; i < updatedScenes.length; i++) {
      const scene = updatedScenes[i];
      const text = (scene.voiceoverText || scene.dialogue || "").trim();

      if (!text) {
        updatedScenes[i] = {
          ...scene,
          voiceoverStatus: "idle" as const,
          voiceoverVoice: voice,
        };
        results.push({ sceneId: scene.id, status: "skipped" });
        continue;
      }

      // Mark pending
      updatedScenes[i] = {
        ...scene,
        voiceoverStatus: "pending" as const,
        voiceoverText: text,
        voiceoverVoice: voice,
      };
      await updateProject(body.projectId, { scenes: updatedScenes });

      try {
        const mp3Response = await openai.audio.speech.create({
          model: ttsModel,
          voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
          input: text,
          response_format: "mp3",
        });

        const arrayBuffer = await mp3Response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const audioUrl = `data:audio/mpeg;base64,${base64}`;

        updatedScenes[i] = {
          ...updatedScenes[i],
          voiceoverUrl: audioUrl,
          voiceoverStatus: "ready" as const,
        };
        results.push({ sceneId: scene.id, status: "ready" });
      } catch (sceneErr) {
        updatedScenes[i] = {
          ...updatedScenes[i],
          voiceoverStatus: "error" as const,
        };
        results.push({
          sceneId: scene.id,
          status: `error: ${sceneErr instanceof Error ? sceneErr.message : "unknown"}`,
        });
      }

      // Persist after each scene so partial progress is saved
      await updateProject(body.projectId, { scenes: updatedScenes });
    }

    return NextResponse.json({
      projectId: body.projectId,
      voice,
      results,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
