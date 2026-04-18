import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { personalizedFeed } from "@/lib/recommendations-vec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Personalized recommendations feed (V8 §B4.5).
 *
 * Returns up to 20 films ordered by vector similarity to the user's
 * taste profile. Cold-start / pgvector missing / flag disabled → empty
 * array; the caller renders the heuristic trending feed instead.
 */
export async function GET(req: Request) {
  try {
    if (!(await isFeatureEnabled("recommendationsEnabled"))) {
      return NextResponse.json({ items: [], cold: true, disabled: true });
    }
    const user = await requireUser();
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || "20")));

    const items = await personalizedFeed(user.id, limit);
    return NextResponse.json({ items, cold: items.length === 0 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
