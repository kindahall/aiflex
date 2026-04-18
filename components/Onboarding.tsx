"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";

const KEY = "aiflex.onboarding.done";

interface Step {
  icon: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}

const STEPS: Step[] = [
  {
    icon: "🎬",
    title: "Bienvenue sur AIflex",
    body: "La première plateforme où tu peux regarder ET créer des films entièrement générés par IA. Voici un tour rapide.",
  },
  {
    icon: "🏠",
    title: "Le feed",
    body: "Sur l'accueil, découvre les films publiés par la communauté, le catalogue de démos et les tendances. Tu peux filtrer par genre, chercher par mot-clé, et sauvegarder dans ta watchlist.",
  },
  {
    icon: "✦",
    title: "Le Studio IA",
    body: "Décris une idée en quelques phrases. L'IA construit le concept, le scénario et les scènes. Tu peux modifier chaque scène — dialogue, cadrage, ambiance — puis générer la vidéo plan par plan.",
    cta: { label: "Ouvrir le studio", href: "/studio" },
  },
  {
    icon: "📊",
    title: "Ton dashboard",
    body: "Gère tes projets, suis tes statistiques (vues, likes), publie ou dépublie tes films. Tu peux aussi modifier ton profil public et ton mot de passe.",
    cta: { label: "Voir le dashboard", href: "/dashboard" },
  },
  {
    icon: "🌍",
    title: "La communauté",
    body: "Like, commente et remixe les films des autres créateurs. Tes interactions apparaissent dans leurs notifications. Ton profil public montre tous tes films publiés.",
  },
];

/**
 * First-visit onboarding overlay. Shows a sequence of cards explaining
 * the key sections of the app. Dismissed permanently via localStorage.
 * Only appears for logged-in users who haven't seen it yet.
 */
export default function Onboarding() {
  const { user, loading } = useAuth();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(KEY) === "1") return;
    // Small delay so the page finishes rendering first.
    const t = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(t);
  }, [loading, user]);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, "1");
    }
    setShow(false);
  }

  function next() {
    if (step + 1 >= STEPS.length) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  }

  if (!show) return null;

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-fadeIn"
        onClick={dismiss}
      />
      <div className="fixed left-1/2 top-1/2 z-[61] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 animate-fadeUp">
        <div className="rounded-3xl border border-flex-border bg-flex-card p-8 shadow-cinema">
          {/* Progress */}
          <div className="mb-6 flex items-center gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all ${
                  i <= step ? "bg-flex-accent" : "bg-flex-border"
                }`}
              />
            ))}
          </div>

          <div className="mb-2 text-4xl">{s.icon}</div>
          <h2 className="mb-3 text-2xl font-black tracking-tight">
            {s.title}
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-flex-muted">
            {s.body}
          </p>

          {s.cta && (
            <Link
              href={s.cta.href}
              onClick={dismiss}
              className="mb-4 inline-block rounded-lg border border-flex-accent/50 bg-flex-accent/10 px-4 py-2 text-xs font-semibold text-flex-accent transition hover:bg-flex-accent/20"
            >
              {s.cta.label} →
            </Link>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs font-semibold text-flex-muted transition hover:text-flex-text"
            >
              Passer le tour
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
                >
                  ← Précédent
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="rounded-lg bg-flex-accent px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110"
              >
                {isLast ? "C'est parti !" : "Suivant →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
