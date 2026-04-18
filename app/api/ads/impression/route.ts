import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { recordImpression } from "@/lib/ads";
import type { AdFormat } from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImpressionBody {
  campaignId: string;
  format: AdFormat;
  projectId?: string;
}

/**
 * Record a fully-watched ad impression and debit the campaign budget.
 * The UI player calls this only after the ad completed (pre-roll full,
 * mid-roll full, banner visible ≥ 3 s) to prevent fraud via accidental
 * "partial view" counts.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as ImpressionBody;

    if (!body.campaignId || !body.format) {
      return NextResponse.json({ error: "Champs requis" }, { status: 400 });
    }
    if (!["preroll_15", "midroll_30", "banner"].includes(body.format)) {
      return NextResponse.json({ error: "Format invalide" }, { status: 400 });
    }

    await recordImpression({
      campaignId: body.campaignId,
      projectId: body.projectId,
      userId: user.id,
      format: body.format,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[ads/impression]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
