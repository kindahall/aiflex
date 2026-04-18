import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getCurrentUsage, getSettings } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the current user's monthly video usage and the active quota.
 * Used by the dashboard to render the "X / Y vidéos ce mois" widget.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const usage = await getCurrentUsage(user.id);
    const settings = await getSettings();
    const quota = settings.monthlyVideoQuota || 0;
    return NextResponse.json({
      month: usage.month,
      videosGenerated: usage.videosGenerated,
      quota,
      // Admins are exempt — surface that to the UI so it doesn't show
      // a misleading 0 / quota progress bar.
      unlimited: user.role === "admin",
      remaining:
        quota > 0
          ? Math.max(0, quota - usage.videosGenerated)
          : null,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
