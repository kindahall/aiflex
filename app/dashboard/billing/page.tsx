"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { PLANS, type PlanId } from "@/lib/plans";
import LoadingPulse from "@/components/LoadingPulse";

interface UsageData {
  videosGenerated: number;
  quota: number;
  unlimited: boolean;
  remaining: number | null;
}

export default function BillingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Check for success query param.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("success") === "1") {
        setShowSuccess(true);
        // Clean up URL.
        window.history.replaceState({}, "", "/dashboard/billing");
      }
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push("/login?next=/dashboard/billing");
  }, [loading, user, router]);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/me/usage", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch {
      // Silently fail — usage display is non-critical.
    }
  }, []);

  useEffect(() => {
    if (user) fetchUsage();
  }, [user, fetchUsage]);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Impossible d'ouvrir le portail de facturation.");
      }
    } catch {
      alert("Erreur réseau. Réessaie.");
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <LoadingPulse label="Chargement..." />
      </div>
    );
  }

  const userPlan: PlanId =
    user?.plan || "free";
  const plan = PLANS[userPlan] ?? PLANS.free;
  const hasSubscription = userPlan !== "free";
  const planExpiresAt = user?.planExpiresAt;

  const usedCount = usage?.videosGenerated ?? 0;
  const limit = plan.monthlyVideos;
  const pct = limit > 0 ? Math.min(100, Math.round((usedCount / limit) * 100)) : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      {/* Success banner */}
      {showSuccess && (
        <div className="mb-8 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-center text-sm font-medium text-green-400">
          Paiement réussi ! Ton abonnement {plan.name} est maintenant actif.
        </div>
      )}

      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Facturation
      </div>
      <h1 className="mb-8 text-3xl font-black tracking-tight">
        Mon abonnement
      </h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current plan card */}
        <div className="rounded-2xl border border-flex-border bg-flex-card p-6">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-flex-muted">
            Plan actuel
          </div>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-3xl font-black text-flex-text">
              {plan.name}
            </span>
            {hasSubscription && (
              <span className="rounded-full bg-flex-accent/10 px-2.5 py-0.5 text-xs font-bold text-flex-accent">
                Actif
              </span>
            )}
          </div>

          <ul className="mb-6 space-y-2">
            {plan.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-flex-text/80"
              >
                <span className="mt-0.5 text-flex-accent">{"\u2713"}</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/pricing"
              className="rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-sm font-bold text-flex-text transition hover:border-flex-accent"
            >
              Changer de plan
            </Link>
            {hasSubscription && (
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="rounded-lg bg-flex-accent px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {portalLoading
                  ? "Chargement..."
                  : "Gérer mon abonnement"}
              </button>
            )}
          </div>
        </div>

        {/* Usage card */}
        <div className="rounded-2xl border border-flex-border bg-flex-card p-6">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-flex-muted">
            Utilisation ce mois
          </div>
          <div className="mb-2 text-3xl font-black text-flex-text">
            {usage?.unlimited ? (
              <span className="text-flex-accent">Illimité</span>
            ) : (
              <>
                {usedCount}{" "}
                <span className="text-lg font-medium text-flex-muted">
                  / {limit} vidéos
                </span>
              </>
            )}
          </div>

          {!usage?.unlimited && (
            <div className="mb-4">
              <div className="h-3 overflow-hidden rounded-full bg-flex-border">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pct > 90
                      ? "bg-red-500"
                      : pct > 70
                      ? "bg-amber-500"
                      : "bg-flex-accent"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-flex-muted">
                <span>{pct}% utilisé</span>
                <span>
                  {usage?.remaining != null
                    ? `${usage.remaining} restantes`
                    : ""}
                </span>
              </div>
            </div>
          )}

          {/* Next billing date */}
          {hasSubscription && planExpiresAt && (
            <div className="mt-4 rounded-lg border border-flex-border/50 bg-flex-panel p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-flex-muted">
                Prochain renouvellement
              </div>
              <div className="mt-1 text-sm font-medium text-flex-text">
                {new Date(planExpiresAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>
          )}

          {/* Quota upgrade CTA for free users */}
          {!hasSubscription && (
            <div className="mt-4 rounded-lg border border-flex-accent/20 bg-flex-accent/5 p-3 text-center">
              <p className="mb-2 text-sm text-flex-muted">
                Besoin de plus de vidéos ?
              </p>
              <Link
                href="/pricing"
                className="inline-block rounded-lg bg-flex-accent px-4 py-2 text-sm font-bold text-white transition hover:brightness-110"
              >
                Voir les plans
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Payment history placeholder */}
      <div className="mt-8 rounded-2xl border border-flex-border bg-flex-card p-6">
        <div className="mb-1 text-xs font-bold uppercase tracking-widest text-flex-muted">
          Historique des paiements
        </div>
        {hasSubscription ? (
          <div className="mt-4">
            <p className="text-sm text-flex-muted">
              Consulte ton historique complet de factures et de paiements dans le
              portail Stripe.
            </p>
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="mt-3 rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-sm font-bold text-flex-text transition hover:border-flex-accent disabled:opacity-50"
            >
              {portalLoading ? "Chargement..." : "Voir mes factures"}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-flex-muted">
            Aucun paiement pour le moment. Les factures apparaîtront ici quand
            tu souscriras à un plan payant.
          </p>
        )}
      </div>
    </div>
  );
}
