import "server-only";
import { prisma } from "./prisma";
import { CREATOR_PRO_PLANS, type FilmFormat } from "./types/film";

/**
 * Creator Pro subscription helpers (V8 §21.7).
 *
 * Creator Pro plans come with monthly inclusive quotas per format (e.g. 2
 * episodes of 5min + 1 of 15min per month). The quota is stored on
 * `CreatorPlan { monthlyQuota, usedThisMonth, resetAt }` and consumed
 * every time the agent starts a generation — if the user has quota
 * remaining for the requested format, the generation is free to them.
 *
 * If the user is not on a Creator Pro plan, or quota is exhausted, the
 * regular /api/agent/start pricing applies.
 */

export interface ConsumeResult {
  consumed: boolean;
  remaining?: Partial<Record<FilmFormat, number>>;
  resetAt?: Date;
}

/**
 * Try to consume one unit of the requested format from the user's Creator
 * Pro plan. Returns `{ consumed: true }` when quota was debited (and thus
 * the caller should SKIP the Stripe charge); `{ consumed: false }` when
 * the user has no plan, plan is expired, or no quota remains.
 *
 * Idempotent on the resetAt window: if the window has rolled over, we
 * reset `usedThisMonth` before consuming.
 */
export async function consumeCreatorProQuota(
  userId: string,
  format: FilmFormat
): Promise<ConsumeResult> {
  const plan = await prisma.creatorPlan.findUnique({
    where: { userId },
  });
  if (!plan) return { consumed: false };

  const planCfg = CREATOR_PRO_PLANS[plan.plan];
  if (!planCfg) return { consumed: false };

  const allowed = planCfg.monthlyQuota[format] ?? 0;
  if (allowed <= 0) return { consumed: false };

  // Roll the window if needed
  const now = new Date();
  let used = ((plan.usedThisMonth as Record<string, number>) || {});
  let resetAt = plan.resetAt;
  if (resetAt <= now) {
    used = {};
    resetAt = new Date(now);
    resetAt.setUTCMonth(resetAt.getUTCMonth() + 1);
  }

  const currentlyUsed = used[format] ?? 0;
  if (currentlyUsed >= allowed) {
    return { consumed: false, remaining: remainingFromPlan(plan.plan, used) };
  }

  used = { ...used, [format]: currentlyUsed + 1 };

  await prisma.creatorPlan.update({
    where: { userId },
    data: {
      usedThisMonth: used as unknown as object,
      resetAt,
    },
  });

  return {
    consumed: true,
    remaining: remainingFromPlan(plan.plan, used),
    resetAt,
  };
}

/**
 * Summary of the user's current Creator Pro quota & usage. Null if not on
 * a Creator Pro plan.
 */
export async function getCreatorProStatus(userId: string) {
  const plan = await prisma.creatorPlan.findUnique({ where: { userId } });
  if (!plan) return null;
  const cfg = CREATOR_PRO_PLANS[plan.plan];
  if (!cfg) return null;
  return {
    plan: plan.plan,
    label: cfg.label,
    priceCents: cfg.priceCents,
    monthlyQuota: cfg.monthlyQuota,
    usedThisMonth: plan.usedThisMonth as Record<string, number>,
    remaining: remainingFromPlan(
      plan.plan,
      (plan.usedThisMonth as Record<string, number>) ?? {}
    ),
    resetAt: plan.resetAt,
  };
}

function remainingFromPlan(
  planKey: string,
  used: Record<string, number>
): Partial<Record<FilmFormat, number>> {
  const cfg = CREATOR_PRO_PLANS[planKey];
  if (!cfg) return {};
  const out: Partial<Record<FilmFormat, number>> = {};
  for (const [format, allowed] of Object.entries(cfg.monthlyQuota)) {
    if (typeof allowed !== "number") continue;
    const u = used[format] ?? 0;
    out[format as FilmFormat] = Math.max(0, allowed - u);
  }
  return out;
}
