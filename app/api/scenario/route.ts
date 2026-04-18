import { NextResponse } from "next/server";
import { callClaudeJSON, parseClaudeJSON } from "@/lib/ai-client";
import { SCENARIO_INSTRUCTIONS } from "@/lib/prompts";
import type { Concept, Scenario } from "@/lib/types";
import { AuthError, requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  concept: Concept;
  format: string;
  genre: string;
  tone: string;
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as Body;
    if (!body.concept) {
      return NextResponse.json({ error: "Concept manquant" }, { status: 400 });
    }

    const userPrompt = `${SCENARIO_INSTRUCTIONS}

## Concept validé
${JSON.stringify(body.concept, null, 2)}

## Contraintes
- Genre : ${body.genre}
- Format : ${body.format}
- Ton : ${body.tone}

Écris le scénario maintenant.`;

    const raw = await callClaudeJSON(userPrompt);
    const scenario = parseClaudeJSON<Scenario>(raw);
    return NextResponse.json({ scenario });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
