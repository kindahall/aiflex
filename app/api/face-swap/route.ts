import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { AuthError, requireUser } from "@/lib/auth";
import { checkPlanAccess, planGateError } from "@/lib/plan-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  /** Base image/video URL. */
  sourceUrl: string;
  /** Face image URL to swap in. */
  faceUrl: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    // Plan check — Pro+ only
    const access = await checkPlanAccess(user.id, "face-swap");
    if (!access.allowed) {
      return NextResponse.json(
        { error: planGateError(access.requiredPlan) },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Body;

    if (!body.sourceUrl || !body.faceUrl) {
      return NextResponse.json(
        { error: "sourceUrl et faceUrl requis" },
        { status: 400 }
      );
    }

    const key = process.env.FAL_KEY || "";
    if (!key) {
      return NextResponse.json(
        { error: "FAL_KEY manquant — définis-le dans .env.local." },
        { status: 503 }
      );
    }
    fal.config({ credentials: key });

    const result = await fal.subscribe("fal-ai/face-swap", {
      input: {
        base_image_url: body.sourceUrl,
        swap_image_url: body.faceUrl,
      },
      logs: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = (result as any)?.data ?? result;
    const outputUrl: string | undefined =
      data?.image?.url || data?.output?.url || data?.url;

    if (!outputUrl) {
      return NextResponse.json(
        { error: "Pas de résultat retourné par le modèle face-swap." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      outputUrl,
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
