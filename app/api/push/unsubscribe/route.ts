import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { removePushSubscription } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/unsubscribe
 * Body: { endpoint }
 * Removes the push subscription for the authenticated user.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const { endpoint } = body;
    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json(
        { error: "endpoint requis" },
        { status: 400 }
      );
    }

    await removePushSubscription(user.id, endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
