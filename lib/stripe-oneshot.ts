import "server-only";
import { prisma } from "./prisma";
import { stripePost } from "./stripe";
import { BOOST_CONFIG, type BoostType } from "./types/film";

/**
 * One-shot payments on top of the subscription engine.
 *
 * Flow:
 *   1. Caller creates a Stripe Checkout Session in `mode=payment` (NOT
 *      subscription) with `metadata.kind` indicating what the payment is
 *      for (boost, sequel, upload, ppv, tip).
 *   2. User pays → `checkout.session.completed` webhook fires.
 *   3. Our webhook handler (lib/stripe.ts → handleCheckoutCompleted) sees
 *      `metadata.kind` is set and routes here instead of the subscription
 *      activation path.
 *
 * Every activation is idempotent by `stripePaymentId` — if Stripe replays
 * the webhook we detect the duplicate and skip the side effects.
 */

export type OneShotKind = "boost" | "sequel" | "upload" | "ppv" | "tip";

/**
 * True if the checkout session is a one-shot payment (rather than a
 * subscription activation). Called from handleCheckoutCompleted before
 * it falls back to the subscription code path.
 */
export function isOneShotCheckout(obj: Record<string, unknown>): boolean {
  const meta = obj.metadata as Record<string, string> | undefined;
  const kind = meta?.kind;
  if (!kind) return false;
  return ["boost", "sequel", "upload", "ppv", "tip"].includes(kind);
}

/**
 * Route the event to the right activator based on metadata.kind.
 */
export async function handleOneShotCheckoutCompleted(obj: Record<string, unknown>): Promise<void> {
  const meta = (obj.metadata as Record<string, string>) || {};
  const kind = meta.kind as OneShotKind;
  const paymentId = (obj.payment_intent as string) || (obj.id as string);

  // Stripe emits checkout.session.completed with `payment_status = "unpaid"`
  // for async payment flows that have not yet cleared (e.g. SEPA debit,
  // pending fraud review). Never activate the side-effects until the
  // status is "paid" — otherwise we'd credit tips / unlock PPV / publish
  // uploads for money that never actually settled.
  const paymentStatus = obj.payment_status as string | undefined;
  if (paymentStatus && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return;
  }

  switch (kind) {
    case "boost":
      await activateBoost(obj, paymentId);
      break;
    case "sequel":
      await activateSequel(obj, paymentId);
      break;
    case "upload":
      await activateUpload(obj, paymentId);
      break;
    case "ppv":
      await activatePpv(obj, paymentId);
      break;
    case "tip":
      await activateTip(obj, paymentId);
      break;
  }
}

// ---------------------------------------------------------------------------
// Boost
// ---------------------------------------------------------------------------

async function activateBoost(obj: Record<string, unknown>, paymentId: string): Promise<void> {
  const meta = obj.metadata as Record<string, string>;
  const userId = meta.userId;
  const projectId = meta.projectId;
  const boostType = meta.boostType as BoostType;
  if (!userId || !projectId || !boostType) return;

  // Idempotency
  const existing = await prisma.filmBoost.findFirst({
    where: { stripePaymentId: paymentId },
    select: { id: true },
  });
  if (existing) return;

  const cfg = BOOST_CONFIG[boostType];
  if (!cfg) return;

  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + cfg.durationHours * 60 * 60 * 1000);

  await prisma.filmBoost.create({
    data: {
      projectId,
      userId,
      type: boostType,
      startAt,
      endAt,
      amountPaid: cfg.priceCents,
      stripePaymentId: paymentId,
    },
  });
}

// ---------------------------------------------------------------------------
// Sequel — activate a GenerationJob that was created in "awaiting_payment"
// ---------------------------------------------------------------------------

async function activateSequel(obj: Record<string, unknown>, paymentId: string): Promise<void> {
  const meta = obj.metadata as Record<string, string>;
  const jobId = meta.jobId;
  if (!jobId) return;

  // Idempotency — only activate jobs that are still waiting on payment.
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    select: { status: true, formData: true },
  });
  if (!job || job.status !== "awaiting_payment") return;

  const formData = (job.formData as Record<string, unknown>) || {};
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      formData: {
        ...formData,
        stripePaymentId: paymentId,
      } as unknown as object,
    },
  });

  // Kick off the orchestrator.
  const { orchestrateGeneration } = await import("./agent");
  orchestrateGeneration(jobId).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[stripe-oneshot] sequel ${jobId} orchestrate failed:`, err);
  });
}

// ---------------------------------------------------------------------------
// Upload — flip an upload draft to pending_review once paid
// ---------------------------------------------------------------------------

async function activateUpload(obj: Record<string, unknown>, paymentId: string): Promise<void> {
  const meta = obj.metadata as Record<string, string>;
  const projectId = meta.projectId;
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { adminReviewStatus: true, visibility: true },
  });
  if (!project) return;

  // Idempotency: if already flipped, skip
  if (project.adminReviewStatus === "pending_review") return;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      stripePaymentId: paymentId,
      // Public uploads go into review queue; private-circle uploads
      // jump straight to ready.
      status: project.visibility === "public" ? "pending_review" : "ready",
      adminReviewStatus: project.visibility === "public" ? "pending_review" : null,
      published: project.visibility !== "public",
      publishedAt: project.visibility !== "public" ? new Date() : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Pay-per-view
// ---------------------------------------------------------------------------

async function activatePpv(obj: Record<string, unknown>, paymentId: string): Promise<void> {
  const meta = obj.metadata as Record<string, string>;
  const userId = meta.userId;
  const projectId = meta.projectId;
  if (!userId || !projectId) return;

  const amountCents = Number(meta.amountCents || obj.amount_total || 0);

  // Idempotency via unique constraint on (userId, projectId)
  try {
    await prisma.ppvPurchase.create({
      data: {
        userId,
        projectId,
        amountCents,
        stripePaymentId: paymentId,
      },
    });
  } catch {
    // Unique violation → already purchased, safe to ignore
  }
}

// ---------------------------------------------------------------------------
// Tip (creator donation)
// ---------------------------------------------------------------------------

async function activateTip(obj: Record<string, unknown>, paymentId: string): Promise<void> {
  const meta = obj.metadata as Record<string, string>;
  const fromUserId = meta.fromUserId;
  const toUserId = meta.toUserId;
  if (!fromUserId || !toUserId) return;

  // Idempotency
  const existing = await prisma.tip.findFirst({
    where: { stripePaymentId: paymentId },
    select: { id: true },
  });
  if (existing) return;

  const amount = Number(meta.amountCents || obj.amount_total || 0);
  await prisma.tip.create({
    data: {
      fromUserId,
      toUserId,
      amount,
      currency: (obj.currency as string) || "usd",
      stripePaymentId: paymentId,
      message: meta.message || null,
    },
  });
}

// ---------------------------------------------------------------------------
// Checkout session builder — shared entry for all one-shot payments
// ---------------------------------------------------------------------------

export interface OneShotCheckoutParams {
  kind: OneShotKind;
  userId: string;
  amountCents: number;
  currency?: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  stripeCustomerId?: string;
  /** Arbitrary key/value forwarded through Stripe metadata to the webhook. */
  metadata?: Record<string, string>;
}

/**
 * Create a `mode=payment` Checkout Session. Works for any one-shot payment;
 * the webhook dispatcher reads `metadata.kind` to activate the right entity.
 */
export async function createOneShotCheckout(params: OneShotCheckoutParams): Promise<string> {
  const body: Record<string, string> = {
    mode: "payment",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.userId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": params.currency ?? "usd",
    "line_items[0][price_data][unit_amount]": String(params.amountCents),
    "line_items[0][price_data][product_data][name]": params.description,
    "metadata[kind]": params.kind,
    "metadata[userId]": params.userId,
  };
  if (params.stripeCustomerId) {
    body.customer = params.stripeCustomerId;
  } else if (params.customerEmail) {
    body.customer_email = params.customerEmail;
  }
  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) {
      body[`metadata[${k}]`] = v;
    }
  }
  const session = await stripePost("/checkout/sessions", body);
  return session.url as string;
}
