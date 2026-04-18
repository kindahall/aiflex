import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orchestrateGeneration } from "@/lib/agent";
import { notify } from "@/lib/notify";
import { createOneShotCheckout } from "@/lib/stripe-oneshot";
import { publicUrl } from "@/lib/email";
import {
  sequelLimiter,
  checkPerUser,
  checkPerScope,
  RateLimitError,
} from "@/lib/rate-limit";
import type { FilmFormat, GenerationMode } from "@/lib/types/film";
import { FORMAT_CONFIG, SEQUEL_PRICE, computeLaunchAt, STYLE_PRESETS } from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SequelBody {
  parentFilmId: string;
  format: FilmFormat;
  userPrompt: string;
  mode?: GenerationMode;
  stylePresetId?: string;
  scheduledAt?: string | null;
  visibility?: "private" | "public";
}

/**
 * Core AiFlex differentiator: any subscriber can create a sequel of any
 * public film, even if the parent film is NOT theirs, provided the parent
 * creator enabled `allowSequels`.
 *
 * This endpoint only verifies the eligibility rules (V7 §4.2) and spawns
 * a GenerationJob with `parentFilmId` set — the agent orchestrator then
 * uses the sequel prompt flow (buildSequelAgentInstructions) which
 * preserves characters and continuity from the parent.
 *
 * PAYMENT: when the requester is NOT the parent creator and STRIPE_SECRET_KEY
 * is configured, we park the GenerationJob as `awaiting_payment` and return
 * `checkoutUrl`. The Stripe webhook (kind=sequel) flips it to `pending` and
 * triggers orchestration. Parent creators generating a sequel of their own
 * film skip checkout.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as SequelBody;

    if (!body.parentFilmId || !body.userPrompt?.trim()) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }
    if (!FORMAT_CONFIG[body.format]) {
      return NextResponse.json({ error: "Format invalide" }, { status: 400 });
    }

    const parent = await prisma.project.findUnique({
      where: { id: body.parentFilmId },
      select: {
        id: true,
        ownerId: true,
        title: true,
        status: true,
        allowSequels: true,
        allowPublicSequels: true,
        isDisavowed: true,
        sequelsUnlockAt: true,
        maxSequels: true,
        requireSequelApproval: true,
        notifyOnSequel: true,
        visibility: true,
        _count: { select: { sequels: true } },
      },
    });
    if (!parent) {
      return NextResponse.json({ error: "Film parent introuvable" }, { status: 404 });
    }

    // Eligibility gates (V7 §4.2 + V8 §20)
    if (parent.status !== "ready") {
      return NextResponse.json({ error: "Film parent non prêt" }, { status: 400 });
    }
    if (parent.visibility !== "public") {
      return NextResponse.json(
        { error: "Les suites ne sont possibles que sur des films publics" },
        { status: 403 }
      );
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
          error: "Les suites sont encore verrouillées sur ce film",
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
    if (parent.ownerId !== user.id && !parent.allowPublicSequels) {
      return NextResponse.json(
        { error: "Seul le créateur peut générer des suites de ce film" },
        { status: 403 }
      );
    }

    // V8 §19.8 — per-user (2/h) + per-parent-film (10/day) rate limits.
    // Middleware already guards the IP-level cap; these enforce the
    // semantically-correct per-entity caps that the user/parent expect.
    try {
      await checkPerUser(sequelLimiter, 2, user.id, "sequel-user");
      await checkPerScope(
        "sequel-parent",
        24 * 60 * 60 * 1000,
        10,
        parent.id
      );
    } catch (rl) {
      if (rl instanceof RateLimitError) {
        return NextResponse.json(
          {
            error:
              "Limite de création de suites atteinte. Réessaie plus tard.",
          },
          { status: 429 }
        );
      }
      throw rl;
    }

    const mode: GenerationMode = body.mode ?? "assisted";
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const launchAt = computeLaunchAt(body.format, scheduledAt);
    const priceCents = SEQUEL_PRICE[body.format];

    // Paid sequel: only gate non-owners. The parent creator making their
    // own sequel skips checkout. Caller pays via the returned Stripe URL;
    // the webhook then flips the job to "pending" and kicks orchestration.
    const requiresPayment =
      parent.ownerId !== user.id &&
      Boolean(process.env.STRIPE_SECRET_KEY) &&
      priceCents > 0;

    // V8 §20.3 — parent creator can require manual approval before any
    // sequel of theirs goes live. We park the job in `awaiting_validation`
    // (reusing the existing status) with formData.parentApprovalRequired
    // so the orchestrator + cron know not to advance it without a
    // /account/pending-sequels decision.
    const initialStatus = requiresPayment
      ? "awaiting_payment"
      : parent.requireSequelApproval && parent.ownerId !== user.id
        ? "awaiting_validation"
        : scheduledAt && launchAt && launchAt > new Date()
          ? "scheduled"
          : "pending";

    const job = await prisma.generationJob.create({
      data: {
        userId: user.id,
        mode,
        format: body.format,
        visibility: body.visibility ?? "public",
        userPrompt: body.userPrompt,
        scheduledAt,
        launchAt,
        formData: {
          mode,
          format: body.format,
          userPrompt: body.userPrompt,
          stylePresetId: body.stylePresetId && STYLE_PRESETS[body.stylePresetId]
            ? body.stylePresetId
            : undefined,
          parentFilmId: parent.id,
          priceCents,
          parentApprovalRequired: parent.requireSequelApproval && parent.ownerId !== user.id,
          parentApprovalDeadline:
            parent.requireSequelApproval && parent.ownerId !== user.id
              ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
              : undefined,
        } as unknown as object,
        status: initialStatus,
      },
    });

    // Notify parent creator (V7 §13.3 / notifyOnSequel)
    if (parent.notifyOnSequel && parent.ownerId !== user.id) {
      notify({
        userId: parent.ownerId,
        kind: "system",
        message: `Un abonné a lancé la génération d'une suite de "${parent.title ?? "ton film"}".`,
        href: `/watch/${parent.id}`,
        projectId: parent.id,
      }).catch(() => {});
    }

    // If the job needs payment, create a Stripe Checkout Session now. The
    // `sequel` webhook handler (lib/stripe-oneshot.ts) flips the job to
    // "pending" and spawns the orchestrator once the payment succeeds.
    let checkoutUrl: string | null = null;
    if (requiresPayment) {
      try {
        checkoutUrl = await createOneShotCheckout({
          kind: "sequel",
          userId: user.id,
          amountCents: priceCents,
          description: `Suite AIflex — ${parent.title ?? "film"}`,
          successUrl: publicUrl(`/dashboard/projects?sequelJob=${job.id}`),
          cancelUrl: publicUrl(`/watch/${parent.id}?sequelCancelled=1`),
          customerEmail: user.email,
          metadata: {
            jobId: job.id,
            parentFilmId: parent.id,
            format: body.format,
          },
        });
      } catch (err) {
        // Roll back the job so we don't leave orphaned awaiting_payment rows.
        await prisma.generationJob.delete({ where: { id: job.id } }).catch(() => {});
        // eslint-disable-next-line no-console
        console.error("[sequel] stripe checkout failed:", err);
        return NextResponse.json(
          { error: "Impossible de démarrer le paiement de la suite" },
          { status: 502 }
        );
      }
    } else if (job.status === "pending") {
      orchestrateGeneration(job.id).catch(() => {});
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      priceCents,
      requiresApproval: parent.requireSequelApproval,
      checkoutUrl,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[sequel]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
