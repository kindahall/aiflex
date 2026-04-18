import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/server-db";
import {
  NARRATIVE_MODELS,
  VIDEO_MODELS,
  findNarrativeModel,
  findVideoModel,
  type PlatformSettings,
  type SiteContent,
} from "@/lib/platform-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// API keys are read exclusively from environment variables. The admin UI
// surfaces only a read-only status ("configured / missing") so operators
// can verify env wiring without being able to leak or rotate keys via DB.
function keyStatus() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    fal: Boolean(process.env.FAL_KEY),
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getSettings();
    return NextResponse.json({
      settings: {
        ...settings,
        apiKeys: undefined,
        keyStatus: keyStatus(),
      },
      narrativeModels: NARRATIVE_MODELS,
      videoModels: VIDEO_MODELS,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as Partial<PlatformSettings> & {
      siteContent?: Partial<SiteContent>;
    };
    const patch: Partial<PlatformSettings> = {};

    // --- Models ---
    if (typeof body.narrativeModel === "string") {
      if (!findNarrativeModel(body.narrativeModel)) {
        return NextResponse.json(
          { error: "Modèle narratif inconnu" },
          { status: 400 }
        );
      }
      patch.narrativeModel = body.narrativeModel;
    }
    if (typeof body.videoModel === "string") {
      if (!findVideoModel(body.videoModel)) {
        return NextResponse.json(
          { error: "Modèle vidéo inconnu" },
          { status: 400 }
        );
      }
      patch.videoModel = body.videoModel;
    }

    // --- Policy ---
    if (typeof body.allowSignups === "boolean") {
      patch.allowSignups = body.allowSignups;
    }
    if (
      typeof body.maxScenesPerProject === "number" &&
      body.maxScenesPerProject > 0 &&
      body.maxScenesPerProject < 200
    ) {
      patch.maxScenesPerProject = Math.floor(body.maxScenesPerProject);
    }
    if (
      typeof body.monthlyVideoQuota === "number" &&
      body.monthlyVideoQuota >= 0 &&
      body.monthlyVideoQuota < 100000
    ) {
      patch.monthlyVideoQuota = Math.floor(body.monthlyVideoQuota);
    }

    // --- Featured project ---
    if (body.featuredProjectId !== undefined) {
      patch.featuredProjectId = body.featuredProjectId || undefined;
    }

    // --- Reasoning level ---
    if (typeof body.reasoningLevel === "string") {
      patch.reasoningLevel = body.reasoningLevel;
    }

    // --- TTS ---
    if (typeof body.ttsModel === "string") {
      patch.ttsModel = body.ttsModel;
    }
    if (typeof body.defaultVoice === "string") {
      patch.defaultVoice = body.defaultVoice;
    }

    // API keys are no longer writable via this endpoint — they live in env vars only.

    // --- Site content ---
    if (body.siteContent && typeof body.siteContent === "object") {
      const current = (await getSettings()).siteContent || {};
      const next = { ...current };
      for (const [k, v] of Object.entries(body.siteContent)) {
        if (typeof v === "string") {
          (next as Record<string, string>)[k] = v;
        }
      }
      patch.siteContent = next as SiteContent;
    }

    const settings = await updateSettings(patch);
    return NextResponse.json({
      settings: {
        ...settings,
        apiKeys: undefined,
        keyStatus: keyStatus(),
      },
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
