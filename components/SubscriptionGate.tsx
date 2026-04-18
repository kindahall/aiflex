"use client";

import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

type RequiredPlan =
  | "free"
  | "light"
  | "premium"
  | "family"
  | "creator_pro_basic"
  | "creator_pro_standard"
  | "creator_pro_premium";

interface Props {
  /**
   * Minimum plan required to access the children. Treated as a hierarchy:
   * `free < light < premium < family`. Creator-Pro plans bypass the check
   * (creators always see consumer features).
   */
  minPlan: RequiredPlan;
  /** What the user is unlocking — shown in the upgrade CTA. */
  featureLabel: string;
  /** Where to send the user if they need to upgrade. Default: /pricing. */
  upgradeHref?: string;
  /** Render this instead of the gate UI when the user qualifies. */
  children: React.ReactNode;
  /** When true, fall back to the gate UI even while loading the auth state. */
  hideWhileLoading?: boolean;
}

// Two parallel naming conventions live in the codebase:
//   - V7/V8 brief    : free / light / premium / family
//   - Existing app   : free / pro / studio (lib/plans.ts)
// We rank both so SubscriptionGate works regardless of which the user's row uses.
const PLAN_RANK: Record<string, number> = {
  free: 0,
  light: 1,
  pro: 1,
  premium: 2,
  studio: 2,
  family: 3,
  creator_pro_basic: 1,
  creator_pro_standard: 2,
  creator_pro_premium: 3,
};

/**
 * Wrap any feature that requires a paid plan (V8 §A6).
 *
 * Usage:
 *   <SubscriptionGate minPlan="premium" featureLabel="téléchargement hors-ligne">
 *     <DownloadButton />
 *   </SubscriptionGate>
 *
 * Behavior:
 *   - Loading state → render `null` (or the gate if `hideWhileLoading` is true)
 *     so the page doesn't flicker an upgrade prompt before auth resolves.
 *   - Anonymous → invite to log in.
 *   - Logged-in but plan too low → upgrade CTA.
 *   - Plan high enough → render `children`.
 */
export default function SubscriptionGate({
  minPlan,
  featureLabel,
  upgradeHref = "/pricing",
  children,
  hideWhileLoading,
}: Props) {
  const { user, loading } = useAuth();
  const required = PLAN_RANK[minPlan] ?? 0;

  if (loading) {
    return hideWhileLoading ? <UpgradePrompt featureLabel={featureLabel} upgradeHref={upgradeHref} loading /> : null;
  }

  if (!user) {
    return (
      <UpgradePrompt
        featureLabel={featureLabel}
        upgradeHref={`/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
        cta="Se connecter"
      />
    );
  }

  const userPlan = (user.plan ?? "free") as string;
  const has = PLAN_RANK[userPlan] ?? 0;

  if (has >= required) {
    return <>{children}</>;
  }

  return <UpgradePrompt featureLabel={featureLabel} upgradeHref={upgradeHref} />;
}

function UpgradePrompt({
  featureLabel,
  upgradeHref,
  cta = "Voir les abonnements",
  loading,
}: {
  featureLabel: string;
  upgradeHref: string;
  cta?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-flex-border bg-flex-panel p-6 text-center shadow-cinema">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-flex-accent to-flex-accent2 text-xl">
        ✨
      </div>
      <h3 className="font-display text-lg font-semibold">
        {featureLabel} — abonnement requis
      </h3>
      <p className="mt-2 text-sm text-flex-muted">
        Active un abonnement AIflex pour débloquer cette fonctionnalité.
      </p>
      <Link
        href={upgradeHref}
        aria-disabled={loading}
        className={`mt-4 inline-block rounded-full bg-flex-accent px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 ${
          loading ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}
