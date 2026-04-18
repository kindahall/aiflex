import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { selectAd } from "@/lib/ads";
import type { AdFormat } from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve an ad to play for a given slot. Returns 204 No Content when no
 * campaign matches (the player then simply skips the ad break).
 *
 * Query: format=preroll_15|midroll_30|banner, projectId=<film>, [country]
 */
export async function GET(req: Request) {
  if (!(await isFeatureEnabled("adsEnabled"))) {
    return new NextResponse(null, { status: 204 });
  }
  const url = new URL(req.url);
  const format = url.searchParams.get("format") as AdFormat | null;
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const country =
    url.searchParams.get("country") ??
    req.headers.get("cf-ipcountry") ??
    undefined;

  if (!format || !["preroll_15", "midroll_30", "banner"].includes(format)) {
    return NextResponse.json({ error: "Format invalide" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const userPlan = user?.plan;

  const ad = await selectAd({
    format,
    projectId,
    userId: user?.id,
    userPlan: userPlan ?? undefined,
    country: country ?? undefined,
  });

  if (!ad) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(ad);
}
