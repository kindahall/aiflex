import { NextResponse } from "next/server";
import { getSettings } from "@/lib/server-db";
import { DEFAULT_SITE_CONTENT } from "@/lib/platform-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public endpoint — returns the site content (CMS texts) configured by
 * the admin. No auth required so the homepage can fetch it on mount.
 * Never exposes API keys or internal settings.
 */
export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    content: { ...DEFAULT_SITE_CONTENT, ...settings.siteContent },
    featuredProjectId: settings.featuredProjectId || null,
  });
}
