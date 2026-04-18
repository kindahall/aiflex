"use client";

import { useState } from "react";
import { BOOST_CONFIG, type BoostType } from "@/lib/types/film";

interface Props {
  projectId: string;
  /** Current active boosts so we can disable the buttons if one is running. */
  activeBoosts?: Array<{ type: BoostType; endAt: string }>;
}

const ORDER: BoostType[] = ["homepage_24h", "category_7d", "badge_30d"];

const ICONS: Record<BoostType, string> = {
  homepage_24h: "⚡",
  category_7d: "🎯",
  badge_30d: "🏆",
};

const DESCRIPTIONS: Record<BoostType, string> = {
  homepage_24h:
    "Apparition en tête de la page d'accueil pendant 24 heures, toutes catégories confondues. Idéal pour un lancement.",
  category_7d:
    "Mise en avant dans ta catégorie pendant 7 jours. Touche des spectateurs déjà intéressés par ton genre.",
  badge_30d:
    "Badge « du moment » pendant 30 jours + priorité dans les suggestions de recommandations.",
};

export default function BoostSelector({ projectId, activeBoosts = [] }: Props) {
  const [selected, setSelected] = useState<BoostType | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTypes = new Set(activeBoosts.map((b) => b.type));

  async function checkout(type: BoostType) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/boost/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, boostType: type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {ORDER.map((type) => {
          const cfg = BOOST_CONFIG[type];
          const isActive = activeTypes.has(type);
          const isSelected = selected === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => !isActive && setSelected(type)}
              disabled={isActive}
              className={`group flex flex-col rounded-3xl border p-5 text-left transition ${
                isActive
                  ? "cursor-not-allowed border-emerald-500/30 bg-emerald-500/10"
                  : isSelected
                    ? "border-flex-accent bg-flex-accent/10 shadow-glowSm"
                    : "border-flex-border bg-flex-panel hover:border-flex-accent/50"
              }`}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-2xl">{ICONS[type]}</span>
                {isActive ? (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    Actif
                  </span>
                ) : (
                  <span className="text-lg font-display font-bold text-flex-accent">
                    ${(cfg.priceCents / 100).toFixed(2)}
                  </span>
                )}
              </div>
              <div className="font-semibold">{cfg.label}</div>
              <p className="mt-2 text-sm text-flex-muted">
                {DESCRIPTIONS[type]}
              </p>
              {isActive && (
                <p className="mt-2 text-xs text-emerald-400">
                  Jusqu&apos;au{" "}
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(activeBoosts.find((b) => b.type === type)!.endAt))}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        disabled={!selected || pending}
        onClick={() => selected && checkout(selected)}
        className="w-full rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-6 py-3.5 font-medium text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? "Redirection vers le paiement…"
          : selected
            ? `Activer ${BOOST_CONFIG[selected].label} — $${(BOOST_CONFIG[selected].priceCents / 100).toFixed(2)}`
            : "Choisis un boost"}
      </button>

      <p className="text-center text-xs text-flex-muted">
        Paiement par Stripe. Le boost démarre dès que Stripe confirme le
        paiement (quelques secondes).
      </p>
    </div>
  );
}
