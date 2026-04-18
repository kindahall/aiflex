import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { createSeries } from "@/lib/series-orchestrator";
import { SERIES_CONFIG, STYLE_PRESETS } from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  seriesPackId: keyof typeof SERIES_CONFIG;
  userPrompt: string;
  mode?: "express" | "assisted";
  visibility?: "private" | "private_circle" | "public";
  releaseMode?: "binge" | "weekly";
  stylePresetId?: string;
}

/**
 * Create a full series (V7 §5).
 *
 * Payment gating: skipped for now (same TODO as /api/sequel). Once the
 * billing flow is finalized, wrap this behind a `createOneShotCheckout`
 * call in /api/series/checkout and activate in the webhook.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;

    if (!body.userPrompt?.trim()) {
      return NextResponse.json({ error: "Prompt requis" }, { status: 400 });
    }
    if (!SERIES_CONFIG[body.seriesPackId]) {
      return NextResponse.json({ error: "Pack série inconnu" }, { status: 400 });
    }
    if (body.stylePresetId && !STYLE_PRESETS[body.stylePresetId]) {
      return NextResponse.json({ error: "Style inconnu" }, { status: 400 });
    }

    const result = await createSeries({
      userId: user.id,
      userPrompt: body.userPrompt,
      seriesPackId: body.seriesPackId,
      mode: body.mode ?? "assisted",
      visibility: body.visibility ?? "private",
      releaseMode: body.releaseMode ?? "binge",
      stylePresetId: body.stylePresetId,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[series/create]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
