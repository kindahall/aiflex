import { NextRequest, NextResponse } from "next/server";
import { handleWebhookEvent } from "@/lib/stripe";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint.
 * No auth — uses Stripe signature verification instead.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature") || "";

    if (!signature) {
      return NextResponse.json(
        { error: "Signature manquante" },
        { status: 400 }
      );
    }

    const result = await handleWebhookEvent(body, signature);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur webhook";
    captureError(err, { route: "api/webhooks/stripe" }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
