import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  level: "self_declared" | "verified";
  /** When `level === "verified"`, the Yoti session id from the SDK callback. */
  yotiSessionId?: string;
}

/**
 * Persist the user's age verification status (V8 §19.4).
 *
 * Two levels (V8 brief):
 *   - "self_declared" : auto-déclaration + presence of a payment method
 *     elsewhere (we don't enforce the payment check here — UI does)
 *   - "verified"      : Yoti / VerifyMy callback successfully completed
 *
 * Yoti integration is NOT live in this codebase (no API key, no SDK
 * dependency). When called with `level: "verified"` and no
 * `YOTI_API_KEY`, we still mark the user as `self_declared` so dev/test
 * can flow through; production must wire the Yoti callback before flipping
 * to `"verified"`.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;

    if (body.level !== "self_declared" && body.level !== "verified") {
      return NextResponse.json({ error: "Niveau invalide" }, { status: 400 });
    }

    let effectiveLevel: "self_declared" | "verified" = body.level;
    let warning: string | undefined;

    if (body.level === "verified") {
      const { isYotiConfigured, getYotiSessionStatus } = await import("@/lib/yoti");
      if (!isYotiConfigured()) {
        // Fail-closed in production: returning self_declared when Yoti is
        // missing would let minors bypass age verification on a
        // misconfigured deploy. Dev/test keep the degraded fallback.
        const isProd =
          process.env.NODE_ENV === "production" || process.env.AGE_VERIFICATION_ENFORCE === "1";
        if (isProd) {
          return NextResponse.json(
            {
              error: "Vérification d'âge indisponible (YOTI_API_KEY manquant).",
            },
            { status: 503 }
          );
        }
        effectiveLevel = "self_declared";
        warning =
          "Vérification Yoti non configurée (YOTI_API_KEY manquant) — fallback en self_declared.";
      } else if (!body.yotiSessionId) {
        return NextResponse.json(
          { error: "yotiSessionId manquant pour une vérification de niveau 2" },
          { status: 400 }
        );
      } else {
        // V8 §19.4 — validate the Yoti session before flipping verified.
        const status = await getYotiSessionStatus(body.yotiSessionId);
        if (status.state !== "COMPLETED" || !status.ageVerified) {
          return NextResponse.json(
            {
              error:
                "Vérification Yoti incomplète ou refusée. Réessaie depuis /account/verify-age.",
              yotiState: status.state,
            },
            { status: 400 }
          );
        }
        if (status.userTrackingId && status.userTrackingId !== user.id) {
          return NextResponse.json(
            { error: "Session Yoti liée à un autre utilisateur." },
            { status: 403 }
          );
        }
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        ageVerified: effectiveLevel,
        ageVerifiedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      level: effectiveLevel,
      warning,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
