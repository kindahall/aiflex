import "server-only";
import { prisma } from "./prisma";
import {
  SUBSCRIPTION_VALUE_CENTS,
  PAYOUT_THRESHOLD_CENTS,
  netAfterFees,
  calculatePayoutSplit,
  type UserPlan,
  type PayoutType,
} from "./types/film";

/**
 * Creator payout engine (V7 §8, V8 §21).
 *
 * Called on the 1st of each month by cron `/api/payouts`. Produces one
 * `CreatorPayout` row per (creator, project, payoutType) tuple:
 *   - "primary"  — main creator of the film
 *   - "royalty"  — creator of the parent film when a sequel is watched
 *   - "collab"   — secondary creators listed in CollaboratorSplit
 *   - "bundle"   — earnings from CreatorBundleSubscription (not implemented yet)
 *
 * Spotify-style value-per-view:
 *   viewValue = userSubscriptionValue / userFilmsWatchedThisMonth
 *
 * Completion-tiered split:
 *   100%   → 50% creator
 *   70-99% → 35% creator
 *   30-69% → 15% creator
 *   < 30%  → 0%
 *
 * Royalty split (if parent.royaltyPercent > 0 and film is a sequel):
 *   N% of raw viewValue goes to the parent film creator
 */

export interface PayoutRunResult {
  month: string;
  createdRows: number;
  totalGrossCents: number;
  totalNetCents: number;
  belowThreshold: number;
  errors: string[];
}

/**
 * Run the monthly payout computation for `month` (format "YYYY-MM").
 * Idempotent: unique key `(userId, projectId, month, payoutType)` ensures
 * re-runs don't duplicate rows.
 */
export async function runMonthlyPayouts(month: string): Promise<PayoutRunResult> {
  const result: PayoutRunResult = {
    month,
    createdRows: 0,
    totalGrossCents: 0,
    totalNetCents: 0,
    belowThreshold: 0,
    errors: [],
  };

  const { start, end } = monthBounds(month);

  // Per-user total films watched this month, for the Spotify-style denominator.
  const viewsThisMonth = await prisma.filmView.findMany({
    where: { watchedAt: { gte: start, lt: end } },
    select: {
      userId: true,
      userPlan: true,
      projectId: true,
      percentageWatched: true,
    },
  });

  const filmsWatchedByUser = new Map<string, number>();
  for (const v of viewsThisMonth) {
    const key = v.userId;
    const distinctKey = `${v.userId}:${v.projectId}`;
    if (!seenDistinct.has(distinctKey)) {
      seenDistinct.add(distinctKey);
      filmsWatchedByUser.set(key, (filmsWatchedByUser.get(key) ?? 0) + 1);
    }
  }

  // Group view values by (creator, project, payoutType)
  const accumulator = new Map<string, PayoutAccum>();

  for (const view of viewsThisMonth) {
    if (!view.projectId) continue;
    if (view.percentageWatched < 30) continue; // no revenue below 30%

    const project = await prisma.project.findUnique({
      where: { id: view.projectId },
      select: {
        id: true,
        ownerId: true,
        parentFilmId: true,
        royaltyPercent: true,
        collaboratorSplits: {
          select: { userId: true, percent: true },
        },
      },
    });
    if (!project) continue;

    const plan = (view.userPlan as UserPlan) || "free";
    const subValue = SUBSCRIPTION_VALUE_CENTS[plan] ?? 0;
    if (subValue === 0) continue;

    const watchedCount = Math.max(1, filmsWatchedByUser.get(view.userId) ?? 1);
    const viewValue = Math.floor(subValue / watchedCount);

    // Determine royaltyPercent if this is a sequel
    let parentRoyaltyPercent = 0;
    if (project.parentFilmId) {
      const parent = await prisma.project.findUnique({
        where: { id: project.parentFilmId },
        select: { royaltyPercent: true, ownerId: true },
      });
      if (parent) parentRoyaltyPercent = parent.royaltyPercent;
      (project as { parentOwnerId?: string }).parentOwnerId = parent?.ownerId;
    }

    const split = calculatePayoutSplit(
      viewValue,
      view.percentageWatched,
      parentRoyaltyPercent
    );

    // Primary payout (to the creator of the film being watched)
    const primaryBase = split.sequelCreator;
    const primaryPrincipalPct = 100 -
      project.collaboratorSplits.reduce((sum, c) => sum + c.percent, 0);

    addAccum(
      accumulator,
      { userId: project.ownerId, projectId: project.id, payoutType: "primary" },
      Math.round(primaryBase * (Math.max(0, primaryPrincipalPct) / 100)),
      view.percentageWatched
    );

    // Collab splits
    for (const collab of project.collaboratorSplits) {
      if (collab.percent <= 0) continue;
      addAccum(
        accumulator,
        { userId: collab.userId, projectId: project.id, payoutType: "collab" },
        Math.round(primaryBase * (collab.percent / 100)),
        view.percentageWatched
      );
    }

    // Royalty to parent creator
    if (split.originalCreator > 0 && project.parentFilmId) {
      const parentOwnerId = (project as { parentOwnerId?: string }).parentOwnerId;
      if (parentOwnerId) {
        addAccum(
          accumulator,
          {
            userId: parentOwnerId,
            projectId: project.parentFilmId,
            payoutType: "royalty",
          },
          Math.round(split.originalCreator),
          view.percentageWatched
        );
      }
    }
  }

  // Write CreatorPayout rows (upsert idempotent on unique tuple)
  for (const [key, data] of accumulator.entries()) {
    try {
      const net = netAfterFees(data.grossCents);
      const status =
        net >= PAYOUT_THRESHOLD_CENTS ? "pending" : "below_threshold";
      if (status === "below_threshold") result.belowThreshold++;

      await prisma.creatorPayout.upsert({
        where: {
          userId_projectId_month_payoutType: {
            userId: data.userId,
            projectId: data.projectId,
            month,
            payoutType: data.payoutType,
          },
        },
        update: {
          totalViews: data.totalViews,
          qualifiedViews: data.qualifiedViews,
          grossAmount: data.grossCents,
          netAmount: net,
          status,
        },
        create: {
          userId: data.userId,
          projectId: data.projectId,
          month,
          payoutType: data.payoutType,
          totalViews: data.totalViews,
          qualifiedViews: data.qualifiedViews,
          grossAmount: data.grossCents,
          netAmount: net,
          status,
        },
      });
      result.createdRows++;
      result.totalGrossCents += data.grossCents;
      result.totalNetCents += net;
    } catch (err) {
      result.errors.push(
        `[${key}] ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PayoutAccum {
  userId: string;
  projectId: string;
  payoutType: PayoutType;
  grossCents: number;
  totalViews: number;
  qualifiedViews: number;
}

const seenDistinct = new Set<string>();

function addAccum(
  map: Map<string, PayoutAccum>,
  key: { userId: string; projectId: string; payoutType: PayoutType },
  cents: number,
  pct: number
): void {
  const k = `${key.userId}:${key.projectId}:${key.payoutType}`;
  const existing = map.get(k);
  if (existing) {
    existing.grossCents += cents;
    existing.totalViews += 1;
    if (pct >= 30) existing.qualifiedViews += 1;
  } else {
    map.set(k, {
      userId: key.userId,
      projectId: key.projectId,
      payoutType: key.payoutType,
      grossCents: cents,
      totalViews: 1,
      qualifiedViews: pct >= 30 ? 1 : 0,
    });
  }
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

/**
 * Returns the "YYYY-MM" key for the previous calendar month (UTC).
 * Used by the 1st-of-month cron: on 1 May we compute April.
 */
export function previousMonthKey(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Mark a CreatorPayout row as paid once Stripe Connect has confirmed the
 * transfer. Called from the Stripe webhook handler.
 */
export async function markPayoutPaid(
  payoutId: string,
  stripePayoutId: string
): Promise<void> {
  await prisma.creatorPayout.update({
    where: { id: payoutId },
    data: {
      status: "paid",
      stripePayoutId,
      paidAt: new Date(),
    },
  });
}

/**
 * Push all `pending` payouts for a given month to their creators via
 * Stripe Connect. Groups rows per creator — a creator receives ONE transfer
 * per month covering all their primary + collab + royalty earnings, which
 * minimises Stripe's per-transfer fee (0.25% + €0.10).
 *
 * Payouts without a `stripeConnectId` on the creator are skipped with
 * `status: "pending"` preserved — they'll try again next month. The UI
 * nudges the creator to complete onboarding on /dashboard/payouts.
 */
export async function executeMonthlyTransfers(month: string): Promise<{
  month: string;
  creatorsPaid: number;
  totalCents: number;
  skippedNoAccount: number;
  failed: number;
}> {
  // Dynamic import so the rest of payouts.ts stays importable from scripts
  // (stripe-connect.ts ultimately depends on fetch + env vars).
  const { createPayoutTransfer } = await import("./stripe-connect");

  const pending = await prisma.creatorPayout.findMany({
    where: { month, status: "pending" },
    include: {
      user: { select: { stripeConnectId: true } },
    },
  });

  // Group by userId
  const byUser = new Map<
    string,
    {
      stripeConnectId: string | null;
      rows: typeof pending;
      total: number;
    }
  >();
  for (const row of pending) {
    const existing = byUser.get(row.userId) ?? {
      stripeConnectId: row.user.stripeConnectId,
      rows: [],
      total: 0,
    };
    existing.rows.push(row);
    existing.total += row.netAmount;
    byUser.set(row.userId, existing);
  }

  let creatorsPaid = 0;
  let totalCents = 0;
  let skippedNoAccount = 0;
  let failed = 0;

  for (const [userId, bundle] of byUser.entries()) {
    if (!bundle.stripeConnectId) {
      skippedNoAccount++;
      continue;
    }
    if (bundle.total < PAYOUT_THRESHOLD_CENTS) {
      // Already marked below_threshold in runMonthlyPayouts; skip here too.
      continue;
    }
    const payoutIds = bundle.rows.map((r) => r.id).sort();
    const idempotencyKey = `payout:${month}:${userId}:${payoutIds.join(",")}`.slice(
      0,
      255
    );
    try {
      const transfer = await createPayoutTransfer({
        accountId: bundle.stripeConnectId,
        amountCents: bundle.total,
        currency: "usd",
        idempotencyKey,
        metadata: {
          userId,
          month,
          payoutIds: payoutIds.join(","),
        },
      });
      await prisma.creatorPayout.updateMany({
        where: { id: { in: payoutIds } },
        data: {
          status: "paid",
          stripePayoutId: transfer.transferId,
          paidAt: new Date(),
        },
      });
      creatorsPaid++;
      totalCents += bundle.total;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[payouts] transfer failed for ${userId}:`, err);
      failed++;
    }
  }

  return { month, creatorsPaid, totalCents, skippedNoAccount, failed };
}
