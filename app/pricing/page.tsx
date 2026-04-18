"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { PLANS, type PlanId } from "@/lib/plans";

const PLAN_ORDER: PlanId[] = ["free", "pro", "studio", "family"];

const PLAN_ICONS: Record<PlanId, string> = {
  free: "\u{1F3AC}",
  pro: "\u2728",
  studio: "\u{1F48E}",
  family: "\u{1F46A}",
};

const FAQ = [
  {
    q: "Puis-je regarder des films gratuitement ?",
    a: "Oui. Le plan Gratuit donne accès au catalogue et te permet de créer jusqu'à 10 vidéos par mois, sans carte bancaire.",
  },
  {
    q: "Qu'est-ce qu'une vidéo générée ?",
    a: "Chaque scène de ton film est transformée en clip vidéo par l'IA. Un court-métrage de 10 scènes consomme 10 générations sur ton quota mensuel.",
  },
  {
    q: "Puis-je changer de plan à tout moment ?",
    a: "Oui. Tu peux upgrader, downgrader ou annuler à tout moment depuis ton espace facturation. Le changement prend effet immédiatement.",
  },
  {
    q: "Comment fonctionne la facturation annuelle ?",
    a: "En choisissant l'option annuelle, tu économises 20% par rapport au tarif mensuel. Le paiement est prélevé en une seule fois pour 12 mois.",
  },
  {
    q: "Les films que je crée m'appartiennent ?",
    a: "Tu restes propriétaire de tes idées et de tes choix créatifs. Les contenus générés te sont concédés pour un usage sur AIflex et personnel. Consulte nos CGU pour les détails.",
  },
];

function formatPrice(price: number): string {
  if (price === 0) return "0 \u20AC";
  return price.toFixed(2).replace(".", ",") + " \u20AC";
}

export default function PricingPage() {
  const { user } = useAuth();
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState<PlanId | null>(null);

  const currentPlan: PlanId =
    user?.plan || "free";

  async function handleSubscribe(planId: PlanId) {
    if (!user) {
      window.location.href = "/login?next=/pricing";
      return;
    }
    setLoading(planId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, annual }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Erreur lors de la création de la session de paiement.");
      }
    } catch {
      alert("Erreur réseau. Réessaie.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      {/* Header */}
      <div className="mb-4 text-center">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
          Tarifs
        </div>
        <h1 className="mb-3 text-5xl font-black tracking-tight">
          Un plan pour chaque envie
        </h1>
        <p className="mx-auto max-w-xl text-base text-flex-muted">
          Commence gratuitement. Passe au Pro ou Studio quand tu en as besoin.
        </p>
      </div>

      {/* Annual toggle */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <span
          className={`text-sm font-medium ${
            !annual ? "text-flex-text" : "text-flex-muted"
          }`}
        >
          Mensuel
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            annual ? "bg-flex-accent" : "bg-flex-border"
          }`}
          aria-label="Basculer facturation annuelle"
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              annual ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium ${
            annual ? "text-flex-text" : "text-flex-muted"
          }`}
        >
          Annuel
        </span>
        {annual && (
          <span className="rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-bold text-green-500">
            -20%
          </span>
        )}
      </div>

      {/* Plan cards */}
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const isPopular = planId === "pro";
          const isCurrent = user && currentPlan === planId;
          const monthlyPrice = annual && plan.annualPrice > 0
            ? plan.annualPrice / 12
            : plan.price;

          return (
            <div
              key={planId}
              className={`relative flex flex-col rounded-3xl border p-8 transition ${
                isPopular
                  ? "border-flex-accent bg-flex-accent/5 shadow-[0_0_60px_-10px_rgb(var(--flex-accent)/0.15)]"
                  : "border-flex-border bg-flex-card"
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-flex-accent px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-md">
                  Populaire
                </div>
              )}

              <div className="mb-6">
                <div className="mb-3 text-3xl">{PLAN_ICONS[planId]}</div>
                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-flex-muted">
                  {plan.name}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black tracking-tight">
                    {formatPrice(monthlyPrice)}
                  </span>
                  <span className="text-sm text-flex-muted">
                    {plan.price === 0 ? "gratuit pour toujours" : "/ mois"}
                  </span>
                </div>
                {annual && plan.price > 0 && (
                  <p className="mt-1 text-xs text-flex-muted">
                    {formatPrice(plan.annualPrice)} facturé annuellement
                  </p>
                )}
              </div>

              <ul className="mb-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-flex-text/90"
                  >
                    <span className="mt-0.5 text-flex-accent">{"\u2713"}</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="block rounded-xl border border-flex-accent bg-flex-accent/10 py-3.5 text-center text-sm font-bold uppercase tracking-widest text-flex-accent">
                  Plan actuel
                </div>
              ) : plan.price === 0 ? (
                <Link
                  href={user ? "/dashboard" : "/login"}
                  className="block rounded-xl border border-flex-border bg-flex-panel py-3.5 text-center text-sm font-bold uppercase tracking-widest text-flex-text transition hover:border-flex-accent"
                >
                  {user ? "Tableau de bord" : "Commencer gratuitement"}
                </Link>
              ) : (
                <button
                  onClick={() => handleSubscribe(planId)}
                  disabled={loading !== null}
                  className={`block w-full rounded-xl py-3.5 text-center text-sm font-bold uppercase tracking-widest transition ${
                    isPopular
                      ? "bg-flex-accent text-white hover:brightness-110 disabled:opacity-50"
                      : "border border-flex-border bg-flex-panel text-flex-text hover:border-flex-accent disabled:opacity-50"
                  }`}
                >
                  {loading === planId
                    ? "Redirection..."
                    : `Passer au ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Feature comparison */}
      <div className="mt-16 overflow-x-auto">
        <h2 className="mb-8 text-center text-2xl font-black">
          Comparaison détaillée
        </h2>
        <table className="mx-auto w-full max-w-4xl text-sm">
          <thead>
            <tr className="border-b border-flex-border">
              <th className="py-3 text-left font-bold text-flex-muted">
                Fonctionnalité
              </th>
              {PLAN_ORDER.map((id) => (
                <th
                  key={id}
                  className="py-3 text-center font-bold text-flex-text"
                >
                  {PLANS[id].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Vidéos / mois", values: ["10", "50", "200"] },
              { label: "Scènes max / projet", values: ["12", "24", "48"] },
              { label: "Résolution", values: ["720p", "1080p", "4K"] },
              {
                label: "Modèles IA",
                values: ["Standards", "Tous", "Tous"],
              },
              {
                label: "Voix off IA",
                values: ["\u2014", "\u2713", "\u2713"],
              },
              {
                label: "Musique IA",
                values: ["\u2014", "\u2014", "\u2713"],
              },
              {
                label: "Priorité de génération",
                values: ["\u2014", "\u2713", "Maximale"],
              },
              {
                label: "Support prioritaire",
                values: ["\u2014", "\u2014", "\u2713"],
              },
            ].map((row) => (
              <tr
                key={row.label}
                className="border-b border-flex-border/50"
              >
                <td className="py-3 text-flex-text">{row.label}</td>
                {row.values.map((v, i) => (
                  <td
                    key={i}
                    className={`py-3 text-center ${
                      v === "\u2713"
                        ? "text-flex-accent font-bold"
                        : v === "\u2014"
                        ? "text-flex-muted"
                        : "text-flex-text"
                    }`}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FAQ */}
      <div className="mt-16">
        <h2 className="mb-8 text-center text-2xl font-black">
          Questions fréquentes
        </h2>
        <div className="mx-auto max-w-3xl space-y-4">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-flex-border bg-flex-card"
            >
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-bold text-flex-text transition hover:text-flex-accent">
                {item.q}
                <span className="ml-4 text-flex-muted transition group-open:rotate-180">
                  {"\u25BE"}
                </span>
              </summary>
              <div className="border-t border-flex-border px-6 py-4 text-sm leading-relaxed text-flex-muted">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Enterprise CTA */}
      <div className="mt-16 rounded-2xl border border-flex-border bg-flex-panel p-8 text-center">
        <h2 className="mb-3 text-2xl font-black">
          Besoin d&apos;un plan sur mesure ?
        </h2>
        <p className="mx-auto mb-6 max-w-lg text-sm text-flex-muted">
          Studios de production, écoles de cinéma, entreprises — on peut créer
          un plan adapté à tes besoins avec des quotas personnalisés.
        </p>
        <a
          href="mailto:hello@aiflex.app"
          className="inline-block rounded-lg border border-flex-border bg-flex-card px-6 py-3 text-sm font-bold text-flex-text transition hover:border-flex-accent"
        >
          Contacte-nous {"\u2192"}
        </a>
      </div>
    </div>
  );
}
