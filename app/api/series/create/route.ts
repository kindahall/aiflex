import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { checkPlanAccess, planGateError } from "@/lib/plan-gate";
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
 * Create a full series (V7 §5). Gated to Studio plan via `series-create`
 * until the dedicated one-shot checkout flow ships — without the plan
 * gate an unpaid user could trigger an agent pipeline that costs us
 * meaningful dollars in AI provider fees.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const access = await checkPlanAccess(user.id, "series-create");
    if (!access.allowed) {
      return NextResponse.json({ error: planGateError(access.requiredPlan) }, { status: 403 });
    }

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
