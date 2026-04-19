import { NextRequest, NextResponse } from "next/server";
import { handleWebhookEvent } from "@/lib/stripe";
import { captureError } from "@/lib/observability";
import { getTrustedClientIp } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional IP allowlist (double-defense on top of signature verification).
 * Stripe publishes its egress IP ranges at
 *   https://stripe.com/files/ips/ips_webhooks.txt
 * Operators who want extra hardening can set STRIPE_ALLOWED_IPS to a
 * comma-separated list. When unset we degrade to signature-only.
 */
function checkStripeIp(req: NextRequest): boolean {
  const cfg = (process.env.STRIPE_ALLOWED_IPS || "").trim();
  if (!cfg) return true;
  const allow = cfg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = getTrustedClientIp(req);
  return allow.includes(ip);
}

/**
 * Stripe webhook endpoint. Authentication is via the Stripe signature
 * (verified in lib/stripe.ts) and optionally an IP allowlist.
 */
export async function POST(req: NextRequest) {
  try {
    if (!checkStripeIp(req)) {
      return NextResponse.json({ error: "IP refusée" }, { status: 403 });
    }
    const body = await req.text();
    const signature = req.headers.get("stripe-signature") || "";

    if (!signature) {
      return NextResponse.json({ error: "Signature manquante" }, { status: 400 });
    }

    const result = await handleWebhookEvent(body, signature);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur webhook";
    captureError(err, { route: "api/webhooks/stripe" }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
