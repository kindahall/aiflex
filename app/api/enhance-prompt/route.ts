import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { callClaudeJSON, parseClaudeJSON } from "@/lib/ai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  prompt: string;
  genre?: string;
  mood?: string;
}

interface Enhanced {
  enhanced: string;
}

/**
 * Takes a rough visual prompt and asks Claude (via the narrative model)
 * to improve it for text-to-video generation: better camera language,
 * lighting descriptors, lens choices, cinematic style terms.
 *
 * Does NOT generate a video — just returns the upgraded prompt text for
 * the user to review and edit before committing.
 *
 * Fails gracefully if ANTHROPIC_API_KEY isn't set (returns the original
 * prompt unchanged with a warning).
 */
export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as Body;
    if (!body.prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt manquant" },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        enhanced: body.prompt,
        warning:
          "ANTHROPIC_API_KEY manquant — prompt retourné tel quel.",
      });
    }

    const userPrompt = `Tu es un directeur de la photographie expert en prompts text-to-video cinématographiques.

Améliore ce prompt visuel pour un modèle text-to-video (Seedance 2 Pro). Rends-le plus précis et cinématique sans changer la scène elle-même.

Ajoute ou améliore :
- Le style visuel (cinematic, film grain, anamorphic lens…)
- Le cadrage (wide, medium, close-up, over-the-shoulder…)
- La lumière (golden hour, low-key, neon-lit…)
- La palette de couleurs (desaturated, warm tones, cool blues…)
- Le mouvement de caméra (tracking shot, dolly in, static…)
- Un détail sensoriel ou atmosphérique

${body.genre ? `Genre du film : ${body.genre}` : ""}
${body.mood ? `Ambiance : ${body.mood}` : ""}

Prompt original :
${body.prompt}

Retourne un JSON : {"enhanced": "le prompt amélioré en anglais, en une seule phrase ou deux, max 300 mots"}`;

    const raw = await callClaudeJSON(userPrompt);
    const parsed = parseClaudeJSON<Enhanced>(raw);

    return NextResponse.json({ enhanced: parsed.enhanced });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
