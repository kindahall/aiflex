import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getTrustedClientIp } from "@/lib/client-ip";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consent history (RGPD — V8 §19.7).
 *
 * GET  → full history of consents recorded for the current user, newest first
 * POST → record a new consent / opt-out decision; type + version mandatory,
 *        accepted defaults to true. Idempotent per (user, type, version) but
 *        appended chronologically so you always see the full audit trail.
 */

export async function GET() {
  try {
    const me = await requireUser();
    const consents = await prisma.consentRecord.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ consents });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

interface PostBody {
  type: string; // "cgu" | "privacy" | "cookies_analytics" | "cookies_marketing" | "newsletter"
  version: string;
  accepted: boolean;
}

const ALLOWED_TYPES = new Set([
  "cgu",
  "privacy",
  "cookies_analytics",
  "cookies_marketing",
  "newsletter",
]);

export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const body = (await req.json()) as PostBody;

    if (!ALLOWED_TYPES.has(body.type)) {
      return NextResponse.json({ error: "Type inconnu" }, { status: 400 });
    }
    if (!body.version || typeof body.version !== "string") {
      return NextResponse.json({ error: "Version requise" }, { status: 400 });
    }
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(body.version)) {
      return NextResponse.json({ error: "Version invalide" }, { status: 400 });
    }

    // getTrustedClientIp ignores client-supplied X-Forwarded-For unless the
    // trusted proxy secret is set — prevents attackers from poisoning the
    // RGPD Art. 7 audit trail with spoofed IPs.
    const trustedIp = getTrustedClientIp(req);
    const ipAddress = trustedIp && trustedIp !== "anonymous" ? trustedIp : null;

    const record = await prisma.consentRecord.create({
      data: {
        userId: me.id,
        type: body.type,
        version: body.version,
        accepted: !!body.accepted,
        ipAddress,
      },
    });

    return NextResponse.json({ consent: record });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
