import { NextResponse } from "next/server";
import OpenAI from "openai";
import { AuthError, requireUser } from "@/lib/auth";
import { getProjectById, getSettings, updateProject } from "@/lib/server-db";
import { TTS_VOICES } from "@/lib/platform-settings";
import { checkPlanAccess, planGateError } from "@/lib/plan-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  projectId: string;
  sceneId: string;
  text?: string;
  voice?: string;
  /** Language code for multi-language TTS (e.g., "en", "fr", "es", "de", "ja"). */
  language?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;

    if (!body.projectId || !body.sceneId) {
      return NextResponse.json(
        { error: "projectId et sceneId requis" },
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

    // Find scene
    const scenes = project.scenes || [];
    const sceneIdx = scenes.findIndex((s) => s.id === body.sceneId);
    if (sceneIdx === -1) {
      return NextResponse.json(
        { error: "Scene introuvable" },
        { status: 404 }
      );
    }

    const scene = scenes[sceneIdx];
    const text = (body.text?.trim() || scene.dialogue || "").trim();
    if (!text) {
      return NextResponse.json(
        { error: "Aucun texte a synthetiser (dialogue vide)" },
        { status: 400 }
      );
    }

    // Validate voice
    const settings = await getSettings();
    const voice = body.voice || settings.defaultVoice || "nova";
    const validVoice = TTS_VOICES.some((v) => v.id === voice);
    if (!validVoice) {
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

    // Mark scene as pending
    const updatedScenes = [...scenes];
    updatedScenes[sceneIdx] = {
      ...scene,
      voiceoverStatus: "pending" as const,
      voiceoverText: text,
      voiceoverVoice: voice,
    };
    await updateProject(body.projectId, { scenes: updatedScenes });

    // Call OpenAI TTS
    const openai = new OpenAI({ apiKey });
    const ttsModel = settings.ttsModel === "openai-tts-1-hd" ? "tts-1-hd" : "tts-1";

    // Plan check — multi-language TTS requires Pro+
    if (body.language && body.language !== "auto" && body.language !== "fr") {
      const access = await checkPlanAccess(user.id, "multi-lang-tts");
      if (!access.allowed) {
        return NextResponse.json(
          { error: planGateError(access.requiredPlan) },
          { status: 403 }
        );
      }
    }

    // Multi-language support: prepend language instruction if specified.
    // OpenAI TTS naturally handles multiple languages; the language hint
    // improves pronunciation accuracy for non-English text.
    let ttsInput = text;
    if (body.language && body.language !== "auto") {
      const langMap: Record<string, string> = {
        fr: "Prononce en français : ",
        en: "Speak in English: ",
        es: "Habla en español: ",
        de: "Sprich auf Deutsch: ",
        it: "Parla in italiano: ",
        pt: "Fale em português: ",
        ja: "日本語で話してください: ",
        ko: "한국어로 말해주세요: ",
        zh: "请用中文说: ",
        ar: "تحدث بالعربية: ",
        ru: "Говорите по-русски: ",
      };
      const prefix = langMap[body.language];
      if (prefix) ttsInput = prefix + text;
    }

    const mp3Response = await openai.audio.speech.create({
      model: ttsModel,
      voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: ttsInput,
      response_format: "mp3",
    });

    // Convert to base64 data URL for storage (simple approach for MVP;
    // production would upload to S3/R2).
    const arrayBuffer = await mp3Response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const audioUrl = `data:audio/mpeg;base64,${base64}`;

    // Update scene with result
    const finalScenes = [...(await getProjectById(body.projectId))!.scenes!];
    finalScenes[sceneIdx] = {
      ...finalScenes[sceneIdx],
      voiceoverUrl: audioUrl,
      voiceoverStatus: "ready" as const,
      voiceoverText: text,
      voiceoverVoice: voice,
    };
    await updateProject(body.projectId, { scenes: finalScenes });

    return NextResponse.json({
      voiceoverUrl: audioUrl,
      sceneId: body.sceneId,
      voice,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
