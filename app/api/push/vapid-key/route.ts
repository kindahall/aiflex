import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/vapid-key
 * Returns the public VAPID key so the client can subscribe to push.
 */
export async function GET() {
  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json(
      { error: "Push notifications non configurées" },
      { status: 503 }
    );
  }
  return NextResponse.json({ vapidPublicKey: key });
}
