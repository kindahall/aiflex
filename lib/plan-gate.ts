import "server-only";
import { getPlanForUser, type PlanId } from "./plans";
import { findUserById } from "./server-db";
import type { User, UserRecord } from "./types";

/**
 * Feature-to-minimum-plan map.
 * "free" = everyone, "pro" = Pro+Studio, "studio" = Studio only.
 */
const FEATURE_PLANS: Record<string, PlanId> = {
  "face-swap": "pro",
  "lip-sync": "pro",
  messages: "free",
  profiles: "free",
  collaboration: "pro",
  "tips-send": "free",
  "tips-receive": "free",
  parental: "free",
  totp: "free",
  "multi-lang-tts": "pro",
  music: "pro",
  // Series + sequels are expensive agent pipelines — gate to Studio
  // until the dedicated one-shot checkout flow ships. This replaces
  // the "skipped for now" TODOs in /api/series/create and /api/sequel.
  "series-create": "studio",
  "sequel-create": "studio",
  // Real Dolby Atmos encoding via Dolby.io (~$0.30/min). Studio+ only;
  // lower tiers auto-downgrade to the FOSS atmos-stub 5.1 E-AC-3.
  "atmos-real": "studio",
};

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  studio: 2,
  family: 2, // family tier matches studio for feature gating (different value prop)
};

/**
 * Check if a user's current plan allows a given feature.
 * Returns { allowed: true } or { allowed: false, requiredPlan, currentPlan }.
 */
export async function checkPlanAccess(
  userId: string,
  feature: string
): Promise<{ allowed: true } | { allowed: false; requiredPlan: PlanId; currentPlan: PlanId }> {
  const minPlan = FEATURE_PLANS[feature] || "free";
  if (minPlan === "free") return { allowed: true };

  const record = await findUserById(userId);
  if (!record) return { allowed: false, requiredPlan: minPlan, currentPlan: "free" };

  // Admins bypass all plan checks
  if (record.role === "admin") return { allowed: true };

  const plan = getPlanForUser(record as User & Partial<UserRecord>);
  const currentPlanId = plan.id;

  if (PLAN_RANK[currentPlanId] >= PLAN_RANK[minPlan]) {
    return { allowed: true };
  }

  return { allowed: false, requiredPlan: minPlan, currentPlan: currentPlanId };
}

/** Plan names for error messages. */
const PLAN_LABELS: Record<PlanId, string> = {
  free: "Gratuit",
  pro: "Pro",
  studio: "Studio",
  family: "Famille",
};

/** Build a user-friendly error message for a plan gate failure. */
export function planGateError(requiredPlan: PlanId): string {
  return `Cette fonctionnalité nécessite le plan ${PLAN_LABELS[requiredPlan]} ou supérieur. Mets à niveau depuis ton dashboard.`;
}
