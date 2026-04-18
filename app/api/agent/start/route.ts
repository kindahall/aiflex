import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orchestrateGeneration } from "@/lib/agent";
import { captureError, trackEvent } from "@/lib/observability";
import type { FilmFormat, GenerationMode } from "@/lib/types/film";
import { FORMAT_CONFIG, computeLaunchAt, STYLE_PRESETS } from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StartBody {
  mode: GenerationMode;
  format: FilmFormat;
  userPrompt: string;
  visibility?: "private" | "private_circle" | "public";
  stylePresetId?: string;
  scheduledAt?: string | null;
  parentFilmId?: string;
}

/**
 * Kick off a generation job. Returns immediately with the job id so the UI
 * can poll /api/agent/status/[jobId]. The orchestrator runs detached on
 * the Node process (waitUntil is Edge-only; we rely on the process staying
 * alive — acceptable for long-running VPS, not for serverless).
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as StartBody;

    if (!body.userPrompt?.trim()) {
      return NextResponse.json({ error: "Prompt requis" }, { status: 400 });
    }
    if (!FORMAT_CONFIG[body.format]) {
      return NextResponse.json({ error: "Format invalide" }, { status: 400 });
    }
    if (body.mode !== "express" && body.mode !== "assisted") {
      return NextResponse.json({ error: "Mode invalide" }, { status: 400 });
    }
    if (body.stylePresetId && !STYLE_PRESETS[body.stylePresetId]) {
      return NextResponse.json(
        { error: "Style preset inconnu" },
        { status: 400 }
      );
    }
    if (body.parentFilmId) {
      // Sequel preconditions (V7 §4.2)
      const parent = await prisma.project.findUnique({
        where: { id: body.parentFilmId },
        select: {
          id: true,
          status: true,
          allowSequels: true,
          isDisavowed: true,
          sequelsUnlockAt: true,
          maxSequels: true,
          _count: { select: { sequels: true } },
        },
      });
      if (!parent) {
        return NextResponse.json({ error: "Film parent introuvable" }, { status: 404 });
      }
      if (parent.status !== "ready") {
        return NextResponse.json({ error: "Film parent non prêt" }, { status: 400 });
      }
      if (!parent.allowSequels || parent.isDisavowed) {
        return NextResponse.json(
          { error: "Le créateur n'autorise pas les suites sur ce film" },
          { status: 403 }
        );
      }
      if (parent.sequelsUnlockAt && parent.sequelsUnlockAt > new Date()) {
        return NextResponse.json(
          {
            error: "Les suites ne sont pas encore débloquées sur ce film",
            unlockAt: parent.sequelsUnlockAt,
          },
          { status: 403 }
        );
      }
      if (parent.maxSequels && parent._count.sequels >= parent.maxSequels) {
        return NextResponse.json(
          { error: "Limite de suites atteinte sur ce film" },
          { status: 403 }
        );
      }
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const launchAt = computeLaunchAt(body.format, scheduledAt);

    const job = await prisma.generationJob.create({
      data: {
        userId: user.id,
        mode: body.mode,
        format: body.format,
        visibility: body.visibility ?? "private",
        userPrompt: body.userPrompt,
        scheduledAt,
        launchAt,
        formData: {
          mode: body.mode,
          format: body.format,
          userPrompt: body.userPrompt,
          stylePresetId: body.stylePresetId,
          parentFilmId: body.parentFilmId,
        } as unknown as object,
        status: scheduledAt && launchAt && launchAt > new Date()
          ? "scheduled"
          : "pending",
      },
    });

    // V8 §21.7 — try to consume a Creator Pro quota unit for this format.
    // When consumed, this generation is covered by the subscription and
    // shouldn't trigger a Stripe one-shot.
    let creatorProQuotaConsumed = false;
    try {
      const { consumeCreatorProQuota } = await import("@/lib/creator-pro");
      const result = await consumeCreatorProQuota(user.id, body.format);
      creatorProQuotaConsumed = result.consumed;
    } catch {
      /* non-critical */
    }

    trackEvent(user.id, "generation_started", {
      jobId: job.id,
      format: body.format,
      mode: body.mode,
      visibility: body.visibility,
      isSequel: !!body.parentFilmId,
      scheduled: job.status === "scheduled",
      creatorProQuotaConsumed,
    }).catch(() => {});

    // Kick off orchestration for immediate jobs. Fire-and-forget — errors
    // will be persisted to job.errorMessage by the orchestrator itself.
    if (job.status === "pending") {
      orchestrateGeneration(job.id).catch((err) => {
        captureError(err, {
          route: "api/agent/start.orchestrate",
          jobId: job.id,
          userId: user.id,
        }).catch(() => {});
      });
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      launchAt: job.launchAt,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[agent/start]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
