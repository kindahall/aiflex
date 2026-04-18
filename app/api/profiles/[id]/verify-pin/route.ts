import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/parental";
import { authLimiter, checkPerScope, RateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  pin: string;
}

/**
 * Verify a parental PIN before switching to an adult profile (V8 §22.2).
 *
 * Rate-limited (5 attempts / hour / profileId) to bound brute-force.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as Body;

    if (!body.pin) {
      return NextResponse.json({ error: "PIN requis" }, { status: 400 });
    }

    // Anti brute-force per-profile
    try {
      await checkPerScope(
        "verify-pin",
        60 * 60 * 1000,
        5,
        `${user.id}:${id}`
      );
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Trop de tentatives. Réessaie dans une heure." },
          { status: 429 }
        );
      }
      throw err;
    }

    const profile = await prisma.profile.findUnique({
      where: { id },
      select: { userId: true, parentalPin: true },
    });
    if (!profile || profile.userId !== user.id) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }
    if (!profile.parentalPin) {
      // No PIN set — caller shouldn't have prompted, treat as success
      return NextResponse.json({ ok: true, valid: true });
    }

    const valid = verifyPin(body.pin, profile.parentalPin);
    if (!valid) {
      return NextResponse.json({ ok: true, valid: false }, { status: 401 });
    }

    return NextResponse.json({ ok: true, valid: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  } finally {
    void authLimiter; // referenced to keep import side-effect alive
  }
}
