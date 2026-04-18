import "server-only";
import { prisma } from "./prisma";
import { stripePost, stripeGet, isStripeConfigured } from "./stripe";

/**
 * Stripe Connect — creator payouts (V7 §8.3, V8 §A11).
 *
 * Uses the Connect "Express" flavor: Stripe hosts the onboarding UI and
 * compliance (KYC, tax, bank account collection). We just get a connected
 * account id (`acct_...`) and wire it to `User.stripeConnectId`.
 *
 * Money flow:
 *   1. Creator signs up → stays on "none" (no account yet)
 *   2. Creator clicks "Activer les versements" → we call createOrGetAccount
 *      and send them to an Account Link
 *   3. Stripe redirects back → refresh status, show "charges_enabled" /
 *      "payouts_enabled" / pending requirements
 *   4. Monthly cron: for each `CreatorPayout {status: "pending"}` with
 *      netAmount >= threshold, create a Transfer to their Connect account
 *   5. `transfer.created` / `transfer.paid` webhook flips the payout row
 *      to "paid" with `stripePayoutId`
 *
 * Platform takes a 2% fee (already deducted in `netAfterFees` so the
 * transfer amount IS the net). Stripe's own fees (0.25% + €0.10 per
 * payout for Express EU) are paid out of our margin.
 */

export interface ConnectAccountStatus {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requiresAction: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
  country: string | null;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Account lifecycle
// ---------------------------------------------------------------------------

/**
 * Idempotent: returns the existing account id if the user already has one,
 * otherwise creates a new Express account and stores it on the user row.
 */
export async function createOrGetConnectAccount(
  userId: string,
  email: string,
  country = "FR"
): Promise<string> {
  if (!isStripeConfigured()) {
    throw new Error("Stripe n'est pas configuré (STRIPE_SECRET_KEY manquant)");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeConnectId: true },
  });
  if (user?.stripeConnectId) return user.stripeConnectId;

  const account = await stripePost("/accounts", {
    type: "express",
    country,
    email,
    "capabilities[transfers][requested]": "true",
    "business_type": "individual",
    "metadata[userId]": userId,
  });
  const accountId = account.id as string;

  await prisma.user.update({
    where: { id: userId },
    data: { stripeConnectId: accountId },
  });

  return accountId;
}

/**
 * Return a Stripe-hosted URL the creator must visit to complete onboarding
 * (or to fix newly-required information after an account update).
 *
 * `returnUrl` is where Stripe sends them after success, `refreshUrl` is
 * where Stripe sends them if the link itself expires or a retry is needed.
 */
export async function createAccountLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const link = await stripePost("/account_links", {
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });
  return link.url as string;
}

/**
 * Short-lived link to the Express-hosted dashboard where the creator
 * manages their own bank account / tax info / payout schedule.
 */
export async function createLoginLink(accountId: string): Promise<string> {
  const link = await stripePost(`/accounts/${accountId}/login_links`, {});
  return link.url as string;
}

/**
 * Fetch the current status of a connected account. The "ready to receive
 * payouts" state is: `chargesEnabled && payoutsEnabled && detailsSubmitted`.
 */
export async function getConnectAccountStatus(
  accountId: string
): Promise<ConnectAccountStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acct: any = await stripeGet(`/accounts/${accountId}`);
  const requirements = acct.requirements as
    | { currently_due?: string[]; disabled_reason?: string | null }
    | undefined;
  return {
    accountId,
    chargesEnabled: !!acct.charges_enabled,
    payoutsEnabled: !!acct.payouts_enabled,
    detailsSubmitted: !!acct.details_submitted,
    requiresAction: (requirements?.currently_due?.length ?? 0) > 0,
    disabledReason: requirements?.disabled_reason ?? null,
    currentlyDue: requirements?.currently_due ?? [],
    country: (acct.country as string) ?? null,
    email: (acct.email as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Money movement
// ---------------------------------------------------------------------------

export interface TransferResult {
  transferId: string;
  amount: number;
  currency: string;
  destination: string;
}

/**
 * Send `amountCents` from the platform's Stripe balance to the creator's
 * connected account. Uses an idempotency key so replays don't double-pay.
 *
 * Assumes the platform balance already has the funds (i.e. customer
 * payments have cleared and been retained by the platform).
 */
export async function createPayoutTransfer(params: {
  accountId: string;
  amountCents: number;
  currency?: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}): Promise<TransferResult> {
  if (!isStripeConfigured()) {
    throw new Error("Stripe n'est pas configuré");
  }
  if (params.amountCents <= 0) {
    throw new Error("Montant invalide");
  }

  const body: Record<string, string> = {
    amount: String(params.amountCents),
    currency: params.currency ?? "usd",
    destination: params.accountId,
    transfer_group: params.idempotencyKey.slice(0, 200),
  };
  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) {
      body[`metadata[${k}]`] = v;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transfer: any = await stripePostIdempotent(
    "/transfers",
    body,
    params.idempotencyKey
  );

  return {
    transferId: transfer.id as string,
    amount: Number(transfer.amount),
    currency: String(transfer.currency),
    destination: String(transfer.destination),
  };
}

/**
 * stripePost variant that sends an Idempotency-Key header. Kept local so
 * we don't widen the public surface of lib/stripe.ts just for this.
 */
async function stripePostIdempotent(
  endpoint: string,
  body: Record<string, string>,
  idempotencyKey: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY || ""}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } }).error?.message ??
      "Stripe transfer error";
    throw new Error(msg);
  }
  return data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Webhook handlers (called from lib/stripe.ts handleWebhookEvent)
// ---------------------------------------------------------------------------

/**
 * `account.updated` event — refresh any local state we keep in sync with
 * the connected account. Today we only store `stripeConnectId`, but if we
 * later cache `payoutsEnabled` etc. we should update here.
 */
export async function handleConnectAccountUpdated(
  obj: Record<string, unknown>
): Promise<void> {
  const accountId = obj.id as string;
  if (!accountId) return;
  // No local caching yet — rely on getConnectAccountStatus to fetch live.
  // eslint-disable-next-line no-console
  console.log(`[stripe-connect] account.updated received for ${accountId}`);
}

/**
 * `transfer.paid` event — mark the matching CreatorPayout rows as paid.
 * We correlate via `metadata.payoutIds` set at transfer creation time.
 */
export async function handleTransferPaid(
  obj: Record<string, unknown>
): Promise<void> {
  const transferId = obj.id as string;
  const metadata = (obj.metadata as Record<string, string>) || {};
  const payoutIdsCsv = metadata.payoutIds;
  if (!payoutIdsCsv) return;

  const ids = payoutIdsCsv.split(",").filter(Boolean);
  if (ids.length === 0) return;

  await prisma.creatorPayout.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "paid",
      stripePayoutId: transferId,
      paidAt: new Date(),
    },
  });
}

/**
 * `transfer.failed` — put those CreatorPayouts back to pending so the next
 * cron retries. We keep the `stripePayoutId` so ops can cross-reference.
 */
export async function handleTransferFailed(
  obj: Record<string, unknown>
): Promise<void> {
  const transferId = obj.id as string;
  const metadata = (obj.metadata as Record<string, string>) || {};
  const payoutIdsCsv = metadata.payoutIds;
  if (!payoutIdsCsv) return;

  const ids = payoutIdsCsv.split(",").filter(Boolean);
  await prisma.creatorPayout.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "failed",
      stripePayoutId: transferId,
    },
  });
}
