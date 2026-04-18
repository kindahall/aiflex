import { NextResponse } from "next/server";
import { callClaudeJSON, parseClaudeJSON } from "@/lib/ai-client";
import { SCENES_INSTRUCTIONS } from "@/lib/prompts";
import type { Concept, Scenario, Scene } from "@/lib/types";
import { placeholderFor } from "@/lib/visuals";
import { AuthError, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  concept: Concept;
  scenario: Scenario;
  format: string;
  genre: string;
  tone: string;
}

interface ScenesResponse {
  scenes: Array<Omit<Scene, "id" | "videoStatus" | "imageUrl" | "videoUrl">>;
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as Body;
    if (!body.concept || !body.scenario) {
      return NextResponse.json(
        { error: "Concept ou scénario manquant" },
        { status: 400 }
      );
    }

    const userPrompt = `${SCENES_INSTRUCTIONS}

## Concept
${JSON.stringify(body.concept, null, 2)}

## Scénario
${JSON.stringify(body.scenario, null, 2)}

## Contraintes
- Genre : ${body.genre}
- Format : ${body.format}
- Ton : ${body.tone}

Découpe en scènes filmables maintenant.`;

    const raw = await callClaudeJSON(userPrompt);
    const parsed = parseClaudeJSON<ScenesResponse>(raw);

    // Enforce the platform-wide cap so an enthusiastic Claude can't blow
    // through fal.ai credits. Configurable from /admin/settings.
    const settings = await getSettings();
    const maxScenes = Math.max(1, settings.maxScenesPerProject || 24);
    const limited = parsed.scenes.slice(0, maxScenes);

    const scenes: Scene[] = limited.map((s, i) => ({
      ...s,
      id: `s_${Date.now()}_${i}`,
      index: i,
      videoStatus: "idle" as const,
      imageUrl: placeholderFor(`${body.concept.title}-${i}`),
    }));

    return NextResponse.json({ scenes });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
