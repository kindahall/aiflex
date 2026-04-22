import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { findUserById, getCurrentUsage, getSettings } from "@/lib/server-db";
import { getAtmosQuotaForUser } from "@/lib/plans";
import type { User, UserRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the current user's monthly video usage and the active quota.
 * Used by the dashboard to render the "X / Y vidéos ce mois" widget,
 * and by RenderSettingsPanel for the Atmos cloud minutes progress bar.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const usage = await getCurrentUsage(user.id);
    const settings = await getSettings();
    const quota = settings.monthlyVideoQuota || 0;

    const record = await findUserById(user.id);
    const atmosQuota = record ? getAtmosQuotaForUser(record as User & Partial<UserRecord>) : 0;

    return NextResponse.json({
      month: usage.month,
      videosGenerated: usage.videosGenerated,
      quota,
      // Admins are exempt — surface that to the UI so it doesn't show
      // a misleading 0 / quota progress bar.
      unlimited: user.role === "admin",
      remaining: quota > 0 ? Math.max(0, quota - usage.videosGenerated) : null,
      // Atmos cloud minutes — used for Studio quota widget. Quota may be
      // MAX_SAFE_INTEGER for admins; the UI reads that as "unlimited".
      atmosMinutesUsed: usage.atmosMinutesUsed ?? 0,
      atmosMinutesQuota: atmosQuota,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
