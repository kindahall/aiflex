import "server-only";
import { prisma } from "./prisma";
import { AD_CPM_CENTS, type AdFormat } from "./types/film";

/**
 * Ad selection & billing (V7 §3.6).
 *
 * Called by `/api/ads/serve` to pick a campaign for a given viewer/film
 * context, and by `/api/ads/impression` to record the view and debit
 * campaign budget. We keep the matching logic simple on purpose:
 *
 *   1. Campaign must be active, within date window, not overspent
 *   2. Format must match the slot (preroll_15 / midroll_30 / banner)
 *   3. targetGenre (if set) must match the film's genre
 *   4. targetCountry (if set) must match viewer country (passed by caller)
 *   5. Among candidates, pick the highest bidding cpmCents × random tiebreak
 *
 * Budget enforcement is "soft" — a campaign can overspend by at most one
 * impression because we check-then-debit without a transaction. Tolerable
 * vs. the cost of contention. Run reconciliation monthly.
 */

export interface AdServeContext {
  format: AdFormat;
  projectId?: string;
  userId?: string;
  userPlan?: string;     // "premium" users never see ads (caller should short-circuit)
  country?: string;      // ISO-2, from Cloudflare header
}

export interface AdSelection {
  campaignId: string;
  format: AdFormat;
  videoUrl: string | null;
  imageUrl: string | null;
  landingUrl: string;
  costCents: number; // what will be billed per impression
}

export async function selectAd(ctx: AdServeContext): Promise<AdSelection | null> {
  // Premium users never see ads
  if (ctx.userPlan === "premium" || ctx.userPlan === "premium_yearly") {
    return null;
  }

  const now = new Date();
  let filmGenre: string | undefined;
  if (ctx.projectId) {
    const film = await prisma.project.findUnique({
      where: { id: ctx.projectId },
      select: { genre: true },
    });
    filmGenre = film?.genre ?? undefined;
  }

  const candidates = await prisma.adCampaign.findMany({
    where: {
      status: "active",
      format: ctx.format,
      startAt: { lte: now },
      OR: [{ endAt: null }, { endAt: { gte: now } }],
    },
    orderBy: { cpmCents: "desc" },
    take: 20,
  });

  const viable = candidates.filter((c) => {
    if (c.spentCents >= c.budgetCents) return false;
    if (c.targetGenre && filmGenre && c.targetGenre !== filmGenre) return false;
    if (c.targetCountry && ctx.country && c.targetCountry !== ctx.country) {
      return false;
    }
    return true;
  });

  if (!viable.length) return null;

  // Probabilistic pick weighted by CPM (higher bid wins more often)
  const totalWeight = viable.reduce((acc, c) => acc + c.cpmCents, 0);
  let r = Math.random() * totalWeight;
  const chosen = viable.find((c) => {
    r -= c.cpmCents;
    return r <= 0;
  }) ?? viable[0];

  return {
    campaignId: chosen.id,
    format: chosen.format as AdFormat,
    videoUrl: chosen.videoUrl,
    imageUrl: chosen.imageUrl,
    landingUrl: chosen.landingUrl,
    costCents: Math.ceil(chosen.cpmCents / 1000), // CPM → cost per 1 impression
  };
}

/**
 * Record an impression and debit the campaign budget.
 * Called by `/api/ads/impression` after the viewer actually watched the ad
 * to completion (pre-roll full, mid-roll full, banner visible > 3s).
 */
export async function recordImpression(params: {
  campaignId: string;
  projectId?: string;
  userId: string;
  format: AdFormat;
}): Promise<void> {
  const costCents = Math.ceil(AD_CPM_CENTS[params.format] / 1000);

  // Write impression + debit in a batch (not a true tx — acceptable for ads)
  await Promise.all([
    prisma.adImpression.create({
      data: {
        campaignId: params.campaignId,
        projectId: params.projectId,
        userId: params.userId,
        format: params.format,
        costCents,
      },
    }),
    prisma.adCampaign.update({
      where: { id: params.campaignId },
      data: {
        spentCents: { increment: costCents },
      },
    }),
  ]);

  // If campaign just exhausted its budget, pause it
  const fresh = await prisma.adCampaign.findUnique({
    where: { id: params.campaignId },
    select: { budgetCents: true, spentCents: true, status: true },
  });
  if (
    fresh &&
    fresh.status === "active" &&
    fresh.spentCents >= fresh.budgetCents
  ) {
    await prisma.adCampaign.update({
      where: { id: params.campaignId },
      data: { status: "ended", endAt: new Date() },
    });
  }
}

/**
 * Monthly CPM cost summary for an advertiser — used by the advertiser
 * dashboard.
 */
export async function campaignStats(campaignId: string): Promise<{
  totalImpressions: number;
  totalSpentCents: number;
  byFormat: Record<string, number>;
}> {
  const impressions = await prisma.adImpression.findMany({
    where: { campaignId },
    select: { format: true, costCents: true },
  });

  const byFormat: Record<string, number> = {};
  let totalSpentCents = 0;
  for (const imp of impressions) {
    byFormat[imp.format] = (byFormat[imp.format] ?? 0) + 1;
    totalSpentCents += imp.costCents;
  }

  return {
    totalImpressions: impressions.length,
    totalSpentCents,
    byFormat,
  };
}
