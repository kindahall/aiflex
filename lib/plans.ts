import type { User, UserRecord } from "./types";

export type PlanId = "free" | "pro" | "studio" | "family";

export interface Plan {
  id: PlanId;
  name: string;
  monthlyVideos: number;
  maxScenes: number;
  features: string[];
  price: number;
  annualPrice: number;
  stripePriceId: string | null;
  stripeAnnualPriceId: string | null;
  /** Max profiles on this plan — enforced in /who-is-watching. */
  maxProfiles?: number;
  /**
   * Monthly Dolby Atmos cloud minutes allowance. Dolby.io currently
   * bills ~$0.30/output-minute for JOC transcoding, so unbounded access
   * on Free or Pro would produce unrecoverable losses; those tiers must
   * stay at 0 and fall through to the atmos-stub 5.1 encode.
   */
  atmosMinutesPerMonth: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Gratuit",
    monthlyVideos: 10,
    maxScenes: 12,
    features: ["10 vidéos/mois", "12 scènes max", "Modèles standards", "720p"],
    price: 0,
    annualPrice: 0,
    stripePriceId: null,
    stripeAnnualPriceId: null,
    maxProfiles: 1,
    atmosMinutesPerMonth: 0,
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyVideos: 50,
    maxScenes: 24,
    features: [
      "50 vidéos/mois",
      "24 scènes max",
      "Tous les modèles",
      "1080p",
      "Voix off IA",
      "Priorité de génération",
    ],
    price: 14.99,
    annualPrice: 143.9, // ~11.99/mo, 20% off
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || null,
    stripeAnnualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || null,
    atmosMinutesPerMonth: 0,
  },
  studio: {
    id: "studio",
    name: "Studio",
    monthlyVideos: 200,
    maxScenes: 48,
    features: [
      "200 vidéos/mois",
      "48 scènes max",
      "Tous les modèles",
      "4K",
      "Voix off IA",
      "Musique IA",
      "Priorité maximale",
      "Support prioritaire",
    ],
    price: 39.99,
    annualPrice: 383.9, // ~31.99/mo, 20% off
    stripePriceId: process.env.STRIPE_STUDIO_PRICE_ID || null,
    stripeAnnualPriceId: process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID || null,
    maxProfiles: 2,
    atmosMinutesPerMonth: 30,
  },
  family: {
    id: "family",
    name: "Famille",
    monthlyVideos: 50,
    maxScenes: 24,
    features: [
      "4 profils simultanés",
      "Contrôle parental par profil",
      "Tous les modèles",
      "1080p",
      "Rapport weekly kids",
      "50 vidéos partagées/mois",
    ],
    price: 14.99,
    annualPrice: 149.9,
    stripePriceId: process.env.STRIPE_FAMILY_PRICE_ID || null,
    stripeAnnualPriceId: process.env.STRIPE_FAMILY_ANNUAL_PRICE_ID || null,
    maxProfiles: 4,
    atmosMinutesPerMonth: 120,
  },
} as const;

/** Return the plan object for a user (defaults to free). */
export function getPlanForUser(
  user: Pick<User, "role"> & Partial<Pick<UserRecord, "plan" | "planExpiresAt">>
): Plan {
  // Admins always get Studio-level access.
  if (user.role === "admin") return PLANS.studio;

  const planId = user.plan || "free";

  // If the subscription has expired, treat as free.
  if (planId !== "free" && user.planExpiresAt && user.planExpiresAt < Date.now()) {
    return PLANS.free;
  }

  return PLANS[planId] ?? PLANS.free;
}

/** Return limits for a given plan. */
export function getPlanLimits(planId: PlanId) {
  const plan = PLANS[planId] ?? PLANS.free;
  return {
    monthlyVideos: plan.monthlyVideos,
    maxScenes: plan.maxScenes,
    atmosMinutes: plan.atmosMinutesPerMonth,
  };
}

/**
 * Resolve the effective monthly Atmos cloud quota for a user. An explicit
 * `atmosMinutesQuota` override always wins; otherwise the plan default
 * applies. Admins are treated as effectively unbounded (Number.MAX_SAFE_INTEGER)
 * to match `checkPlanAccess`'s admin bypass.
 */
export function getAtmosQuotaForUser(
  user: Pick<User, "role"> &
    Partial<Pick<UserRecord, "plan" | "planExpiresAt" | "atmosMinutesQuota">>
): number {
  if (user.role === "admin") return Number.MAX_SAFE_INTEGER;
  if (typeof user.atmosMinutesQuota === "number" && user.atmosMinutesQuota >= 0) {
    return user.atmosMinutesQuota;
  }
  const plan = getPlanForUser(user as User & Partial<UserRecord>);
  return plan.atmosMinutesPerMonth;
}

/** Check whether a user still has video generation quota left this month. */
export function canUserGenerate(
  user: Pick<User, "role" | "usage"> & Partial<Pick<UserRecord, "plan" | "planExpiresAt">>
): boolean {
  // Admins are exempt.
  if (user.role === "admin") return true;

  const plan = getPlanForUser(user as User & Partial<UserRecord>);
  const month = currentMonthKey();

  // If usage is from a different month, counter is effectively 0.
  const used = user.usage && user.usage.month === month ? user.usage.videosGenerated : 0;

  return used < plan.monthlyVideos;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
