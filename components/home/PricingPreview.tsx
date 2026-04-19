"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

interface Tier {
  id: string;
  name: string;
  price: string;
  period: string;
  highlight?: boolean;
  features: string[];
  cta: string;
  href: string;
}

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Découverte",
    price: "0 €",
    period: "/mois",
    features: [
      "Streaming catalogue public",
      "1 projet en brouillon",
      "Publication avec watermark AIflex",
    ],
    cta: "Commencer gratuitement",
    href: "/signup",
  },
  {
    id: "pro",
    name: "Créateur",
    price: "19 €",
    period: "/mois",
    highlight: true,
    features: [
      "Projets illimités",
      "Accès Seedance + Claude narrative",
      "Revenue share 70 % sur les vues",
      "Monétisation suites + pourboires",
    ],
    cta: "Passer Créateur",
    href: "/subscriptions",
  },
  {
    id: "studio",
    name: "Studio",
    price: "79 €",
    period: "/mois",
    features: [
      "Tout Créateur +",
      "Séries hebdo auto-orchestrées",
      "Watermark personnalisé",
      "Support prioritaire",
    ],
    cta: "Contact commercial",
    href: "/advertise",
  },
];

export function PricingPreview() {
  const { tOr } = useTranslation();
  const heading = tOr("home.pricing.heading", "Un prix par niveau de créativité");
  const subtitle = tOr(
    "home.pricing.subtitle",
    "Commence gratuitement. Upgrade quand tes spectateurs arrivent."
  );

  return (
    <section className="mx-auto my-24 max-w-6xl px-6" aria-labelledby="pricing-heading">
      <div className="mb-10 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-flex-border bg-flex-panel px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-flex-accent">
          ✦ tarifs
        </div>
        <h2
          id="pricing-heading"
          className="font-display text-3xl font-black text-flex-text md:text-4xl"
        >
          {heading}
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-flex-muted">{subtitle}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={
              "relative flex flex-col rounded-2xl border p-6 transition " +
              (tier.highlight
                ? "border-flex-accent bg-flex-card shadow-lg shadow-flex-accent/20"
                : "border-flex-border bg-flex-card hover:border-flex-accent/50")
            }
          >
            {tier.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-flex-accent px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                Recommandé
              </div>
            )}
            <div className="mb-4">
              <div className="text-sm font-bold uppercase tracking-widest text-flex-muted">
                {tier.name}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-4xl font-black text-flex-text">
                  {tier.price}
                </span>
                <span className="text-sm text-flex-muted">{tier.period}</span>
              </div>
            </div>
            <ul className="mb-6 flex-1 space-y-2 text-sm text-flex-text">
              {tier.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-flex-accent/15 text-[10px] font-bold text-flex-accent"
                  >
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={tier.href}
              className={
                "inline-flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition " +
                (tier.highlight
                  ? "bg-gradient-to-r from-flex-accent to-flex-accent2 text-white hover:brightness-110"
                  : "border border-flex-border bg-flex-panel text-flex-text hover:border-flex-accent")
              }
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
