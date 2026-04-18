import "server-only";
import { PLANS, type PlanId } from "./plans";
import { findUserById, listUsers, updateUser } from "./server-db";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_API = "https://api.stripe.com/v1";

/** True when Stripe keys are configured. */
export function isStripeConfigured(): boolean {
  return STRIPE_SECRET_KEY.length > 0;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

export async function stripePost(
  endpoint: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } }).error?.message ??
      "Stripe API error";
    throw new Error(msg);
  }
  return data as Record<string, unknown>;
}

export async function stripeGet(
  endpoint: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${endpoint}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } }).error?.message ??
      "Stripe API error";
    throw new Error(msg);
  }
  return data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (HMAC-SHA256, no npm deps)
// ---------------------------------------------------------------------------

async function computeHmac(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<boolean> {
  // Stripe-Signature header format: t=<ts>,v1=<sig>[,v0=<sig>]
  const parts = Object.fromEntries(
    signature.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=")];
    })
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  // Tolerance: 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${body}`;
  const expected = await computeHmac(STRIPE_WEBHOOK_SECRET, signedPayload);
  return expected === v1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout Session and return the URL.
 */
export async function createCheckoutSession(
  userId: string,
  planId: PlanId,
  successUrl: string,
  cancelUrl: string,
  annual = false
): Promise<string> {
  if (!isStripeConfigured()) throw new Error("Stripe non configuré");

  const plan = PLANS[planId];
  if (!plan || plan.price === 0) throw new Error("Plan invalide");

  const priceId = annual ? plan.stripeAnnualPriceId : plan.stripePriceId;
  if (!priceId) throw new Error("Price ID manquant pour ce plan");

  const user = await findUserById(userId);
  if (!user) throw new Error("Utilisateur introuvable");

  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: successUrl,
    cancel_url: cancelUrl,
    "metadata[userId]": userId,
    "metadata[planId]": planId,
    client_reference_id: userId,
  };

  // Reuse existing Stripe customer if available.
  if (user.stripeCustomerId) {
    params.customer = user.stripeCustomerId;
  } else {
    params.customer_email = user.email;
  }

  const session = await stripePost("/checkout/sessions", params);
  return session.url as string;
}

/**
 * Create a Stripe Customer Portal session.
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  if (!isStripeConfigured()) throw new Error("Stripe non configuré");

  const session = await stripePost("/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url as string;
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function handleWebhookEvent(
  body: string,
  signature: string
): Promise<{ received: boolean }> {
  if (!isStripeConfigured()) return { received: false };

  // Verify signature
  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyWebhookSignature(body, signature);
    if (!valid) throw new Error("Signature webhook invalide");
  }

  const event = JSON.parse(body) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object);
      break;
    // ---- Stripe Connect (creator payouts) -----------------------------
    case "account.updated": {
      const { handleConnectAccountUpdated } = await import("./stripe-connect");
      await handleConnectAccountUpdated(event.data.object);
      break;
    }
    case "transfer.paid": {
      const { handleTransferPaid } = await import("./stripe-connect");
      await handleTransferPaid(event.data.object);
      break;
    }
    case "transfer.failed": {
      const { handleTransferFailed } = await import("./stripe-connect");
      await handleTransferFailed(event.data.object);
      break;
    }
    default:
      // Unhandled event type — ignore silently.
      break;
  }

  return { received: true };
}

// ---------------------------------------------------------------------------
// Event handlers (internal)
// ---------------------------------------------------------------------------

async function findUserByStripeCustomer(
  customerId: string
): Promise<string | null> {
  // Linear scan — fine for a JSON-backed prototype.
  // In production you'd index stripeCustomerId in the DB.
  const users = await listUsers();
  const u = users.find((x) => x.stripeCustomerId === customerId);
  return u?.id ?? null;
}

async function resolveUserId(obj: Record<string, unknown>): Promise<string | null> {
  // Try metadata first.
  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.userId) return meta.userId;

  // Try client_reference_id (checkout sessions).
  if (typeof obj.client_reference_id === "string") return obj.client_reference_id;

  // Fall back to searching by Stripe customer ID.
  const customerId = (obj.customer as string) || "";
  if (customerId) return findUserByStripeCustomer(customerId);

  return null;
}

function planIdFromPriceId(priceId: string): PlanId | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceId === priceId || plan.stripeAnnualPriceId === priceId) {
      return plan.id;
    }
  }
  return null;
}

async function handleCheckoutCompleted(obj: Record<string, unknown>) {
  // One-shot payments (boost, sequel, upload, ppv, tip) carry `metadata.kind`
  // and have no `subscription` attached. Route them before the subscription
  // activation path so we don't accidentally write plan data for a boost.
  const { isOneShotCheckout, handleOneShotCheckoutCompleted } = await import(
    "./stripe-oneshot"
  );
  if (isOneShotCheckout(obj)) {
    await handleOneShotCheckoutCompleted(obj);
    return;
  }

  // Creator bundle subscription (V8 §21.5) — also uses metadata.kind but
  // IS a subscription (has `subscription` id). Route it before the default
  // plan-activation path.
  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.kind === "creator_bundle") {
    await handleCreatorBundleCompleted(obj);
    return;
  }
  if (meta?.kind === "creator_pro") {
    await handleCreatorProCompleted(obj);
    return;
  }

  const userId = await resolveUserId(obj);
  if (!userId) return;

  const customerId = obj.customer as string;
  const subscriptionId = obj.subscription as string;

  // Determine plan from metadata or subscription.
  let planId: PlanId = (meta?.planId as PlanId) || "pro";

  // If no planId in metadata, try to resolve from the subscription's price.
  if (!meta?.planId && subscriptionId) {
    try {
      const sub = await stripeGet(`/subscriptions/${subscriptionId}`);
      const items = sub.items as { data: Array<{ price: { id: string } }> };
      const priceId = items?.data?.[0]?.price?.id;
      if (priceId) {
        const resolved = planIdFromPriceId(priceId);
        if (resolved) planId = resolved;
      }
    } catch {
      // Best-effort — keep the metadata-based planId.
    }
  }

  await updateUser(userId, {
    plan: planId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    // Give 35 days of grace for monthly billing.
    planExpiresAt: Date.now() + 35 * 24 * 60 * 60 * 1000,
  });
}

async function handleCreatorBundleCompleted(
  obj: Record<string, unknown>
): Promise<void> {
  const meta = (obj.metadata as Record<string, string>) || {};
  const subscriberId = meta.subscriberId;
  const creatorId = meta.creatorId;
  const subscriptionId = obj.subscription as string;
  const priceCents = Number(meta.priceCents || 499);
  if (!subscriberId || !creatorId || !subscriptionId) return;

  // Compute a rough current period end — refined by subsequent invoice
  // events which carry the exact period_end.
  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() + 1);

  // Dynamic prisma import to avoid cycles
  const { prisma } = await import("./prisma");
  try {
    await prisma.creatorBundleSubscription.upsert({
      where: {
        subscriberId_creatorId: { subscriberId, creatorId },
      },
      update: {
        stripeSubscriptionId: subscriptionId,
        status: "active",
        priceCents,
        currentPeriodEnd: end,
      },
      create: {
        subscriberId,
        creatorId,
        stripeSubscriptionId: subscriptionId,
        status: "active",
        priceCents,
        currentPeriodEnd: end,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stripe] creator bundle activation failed:", err);
  }
}

async function handleCreatorProCompleted(
  obj: Record<string, unknown>
): Promise<void> {
  const meta = (obj.metadata as Record<string, string>) || {};
  const userId = meta.userId;
  const planKey = meta.plan;
  const subscriptionId = obj.subscription as string | undefined;
  if (!userId || !planKey) return;

  const { prisma } = await import("./prisma");
  const { CREATOR_PRO_PLANS } = await import("./types/film");
  const cfg = CREATOR_PRO_PLANS[planKey];
  if (!cfg) return;

  const resetAt = new Date();
  resetAt.setUTCMonth(resetAt.getUTCMonth() + 1);

  try {
    await prisma.creatorPlan.upsert({
      where: { userId },
      update: {
        plan: planKey,
        monthlyQuota: cfg.monthlyQuota as unknown as object,
        usedThisMonth: {} as unknown as object,
        resetAt,
        stripeSubscriptionId: subscriptionId,
      },
      create: {
        userId,
        plan: planKey,
        monthlyQuota: cfg.monthlyQuota as unknown as object,
        usedThisMonth: {} as unknown as object,
        resetAt,
        stripeSubscriptionId: subscriptionId,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stripe] creator-pro activation failed:", err);
  }
}

async function handleSubscriptionUpdated(obj: Record<string, unknown>) {
  const customerId = obj.customer as string;
  const userId = await resolveUserId(obj);
  if (!userId) return;

  const status = obj.status as string;
  const items = obj.items as { data: Array<{ price: { id: string } }> } | undefined;
  const priceId = items?.data?.[0]?.price?.id;

  if (status === "active" || status === "trialing") {
    const planId = priceId ? planIdFromPriceId(priceId) : null;
    const currentPeriodEnd = obj.current_period_end as number | undefined;

    await updateUser(userId, {
      ...(planId ? { plan: planId } : {}),
      stripeCustomerId: customerId,
      stripeSubscriptionId: obj.id as string,
      planExpiresAt: currentPeriodEnd
        ? currentPeriodEnd * 1000 + 3 * 24 * 60 * 60 * 1000 // 3 day grace
        : Date.now() + 35 * 24 * 60 * 60 * 1000,
    });
  } else if (status === "past_due" || status === "unpaid") {
    // Keep plan active but set a short expiry to allow for payment retry.
    await updateUser(userId, {
      planExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  }
}

async function handleSubscriptionDeleted(obj: Record<string, unknown>) {
  const userId = await resolveUserId(obj);
  if (!userId) return;

  await updateUser(userId, {
    plan: "free",
    stripeSubscriptionId: undefined,
    planExpiresAt: undefined,
  });
}

async function handleInvoicePaymentSucceeded(obj: Record<string, unknown>) {
  const userId = await resolveUserId(obj);
  if (!userId) return;

  const subscriptionId = obj.subscription as string | undefined;
  if (!subscriptionId) return;

  // Refresh expiry based on the new period.
  try {
    const sub = await stripeGet(`/subscriptions/${subscriptionId}`);
    const currentPeriodEnd = sub.current_period_end as number | undefined;
    if (currentPeriodEnd) {
      await updateUser(userId, {
        planExpiresAt: currentPeriodEnd * 1000 + 3 * 24 * 60 * 60 * 1000,
      });
    }
  } catch {
    // Non-critical — the subscription.updated event will also refresh.
  }
}

async function handleInvoicePaymentFailed(obj: Record<string, unknown>) {
  const userId = await resolveUserId(obj);
  if (!userId) return;

  // Give 7 days before downgrade — Stripe will retry and eventually cancel.
  await updateUser(userId, {
    planExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
}
