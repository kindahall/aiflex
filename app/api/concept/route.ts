import { NextResponse } from "next/server";
import { callClaudeJSON, parseClaudeJSON } from "@/lib/ai-client";
import { CONCEPT_INSTRUCTIONS } from "@/lib/prompts";
import type { Concept } from "@/lib/types";
import { AuthError, requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  idea: string;
  genre: string;
  format: string;
  tone: string;
  endingHint?: string;
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as Body;
    if (!body.idea?.trim()) {
      return NextResponse.json({ error: "Idée manquante" }, { status: 400 });
    }

    const userPrompt = `${CONCEPT_INSTRUCTIONS}

## Demande de l'utilisateur
- Idée : ${body.idea}
- Genre : ${body.genre}
- Format : ${body.format}
- Ton : ${body.tone}
${body.endingHint ? `- Indications sur la fin : ${body.endingHint}` : ""}

Génère le concept maintenant.`;

    const raw = await callClaudeJSON(userPrompt);
    const concept = parseClaudeJSON<Concept>(raw);
    return NextResponse.json({ concept });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
