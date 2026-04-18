import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { savePushSubscription } from "@/lib/server-db";
import type { PushSubscription } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe
 * Body: { endpoint, keys: { p256dh, auth } }
 * Saves the push subscription for the authenticated user.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const { endpoint, keys } = body;
    if (
      !endpoint ||
      typeof endpoint !== "string" ||
      !keys?.p256dh ||
      !keys?.auth
    ) {
      return NextResponse.json(
        { error: "endpoint et keys (p256dh, auth) requis" },
        { status: 400 }
      );
    }

    const sub: PushSubscription = {
      userId: user.id,
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      createdAt: Date.now(),
    };

    await savePushSubscription(sub);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
