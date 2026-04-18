import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { createYotiSession, isYotiConfigured } from "@/lib/yoti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kick off a Yoti hosted session (V8 §19.4).
 *
 * Returns the URL the user is redirected to. When Yoti isn't configured
 * we return 503 — the UI then offers self-declaration as fallback.
 */
export async function POST() {
  try {
    const user = await requireUser();
    if (!isYotiConfigured()) {
      return NextResponse.json(
        { error: "Vérification Yoti indisponible. Utilise l'auto-déclaration." },
        { status: 503 }
      );
    }
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const handle = await createYotiSession({
      userId: user.id,
      successUrl: `${appUrl}/account/verify-age?yoti=done`,
      callbackUrl: `${appUrl}/api/me/verify-age/yoti-callback`,
      country: "FR",
    });
    return NextResponse.json({
      sessionId: handle.sessionId,
      hostedUrl: handle.hostedUrl,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[yoti-start]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
