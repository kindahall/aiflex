import { NextResponse } from "next/server";
import { trackEvent } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side beacon for landing-page A/B view tracking (V8 §27.5).
 *
 * Forwards the event to PostHog via lib/observability — no DB write,
 * no auth required, no rate-limit beyond the middleware default.
 *
 * Always returns 204 so a slow PostHog never blocks the client.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const variant = typeof body.variant === "string" ? body.variant : "unknown";
    trackEvent("anonymous", "landing_view" as never, {
      variant,
      utm_source: body.utm_source,
      utm_campaign: body.utm_campaign,
      utm_medium: body.utm_medium,
      utm_content: body.utm_content,
      ref: body.ref,
    }).catch(() => {});
  } catch {
    /* no-op */
  }
  return new NextResponse(null, { status: 204 });
}
