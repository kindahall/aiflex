import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startDubbing } from "@/lib/dubbing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  targetLang: string; // ISO-2 code
}

const ALLOWED_LANGS = new Set([
  "en", "fr", "es", "de", "it", "pt", "ja", "ko", "ar", "zh",
  "hi", "ru", "pl", "nl", "tr", "sv",
]);

/**
 * Creator-initiated dubbing (V8 §22.7). Fires the async ElevenLabs job
 * and returns the `dubbingId` — the completion is handled by the dubbing
 * cron or a webhook. Charging not yet wired in; caller should precheck
 * Creator Pro quota before invoking.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const body = (await req.json()) as Body;

    if (!body.targetLang || !ALLOWED_LANGS.has(body.targetLang)) {
      return NextResponse.json({ error: "Langue non supportée" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, outputUrl: true, status: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    if (project.ownerId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    if (project.status !== "ready" || !project.outputUrl) {
      return NextResponse.json(
        { error: "Le film doit être prêt avant d'être doublé." },
        { status: 400 }
      );
    }

    const result = await startDubbing(projectId, body.targetLang);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[dubbing/generate]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
