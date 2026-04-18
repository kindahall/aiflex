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
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Gratuit",
    monthlyVideos: 10,
    maxScenes: 12,
    features: [
      "10 vidéos/mois",
      "12 scènes max",
      "Modèles standards",
      "720p",
    ],
    price: 0,
    annualPrice: 0,
    stripePriceId: null,
    stripeAnnualPriceId: null,
    maxProfiles: 1,
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
    annualPrice: 143.90, // ~11.99/mo, 20% off
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || null,
    stripeAnnualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || null,
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
    annualPrice: 383.90, // ~31.99/mo, 20% off
    stripePriceId: process.env.STRIPE_STUDIO_PRICE_ID || null,
    stripeAnnualPriceId: process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID || null,
    maxProfiles: 2,
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
    annualPrice: 149.90,
    stripePriceId: process.env.STRIPE_FAMILY_PRICE_ID || null,
    stripeAnnualPriceId: process.env.STRIPE_FAMILY_ANNUAL_PRICE_ID || null,
    maxProfiles: 4,
  },
} as const;

/** Return the plan object for a user (defaults to free). */
export function getPlanForUser(user: Pick<User, "role"> & Partial<Pick<UserRecord, "plan" | "planExpiresAt">>): Plan {
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
  };
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
  const used =
    user.usage && user.usage.month === month
      ? user.usage.videosGenerated
      : 0;

  return used < plan.monthlyVideos;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
