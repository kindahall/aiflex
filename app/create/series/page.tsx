"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

type PackId = "mini_5x5" | "standard_10x5" | "mini_5x15" | "standard_10x15";

interface PackOption {
  id: PackId;
  label: string;
  episodes: number;
  durationPerEpisode: number;
  totalMinutes: number;
  privatePrice: number;
  publicPrice: number;
}

const PACKS: PackOption[] = [
  { id: "mini_5x5", label: "Mini-série 5×5 min", episodes: 5, durationPerEpisode: 5, totalMinutes: 25, privatePrice: 4999, publicPrice: 2499 },
  { id: "standard_10x5", label: "Série 10×5 min", episodes: 10, durationPerEpisode: 5, totalMinutes: 50, privatePrice: 9999, publicPrice: 4999 },
  { id: "mini_5x15", label: "Mini-série 5×15 min", episodes: 5, durationPerEpisode: 15, totalMinutes: 75, privatePrice: 14999, publicPrice: 7499 },
  { id: "standard_10x15", label: "Série 10×15 min", episodes: 10, durationPerEpisode: 15, totalMinutes: 150, privatePrice: 29999, publicPrice: 14999 },
];

const STYLE_PRESETS = [
  { id: "", label: "Aucun style imposé", icon: "✨" },
  { id: "pixar_kids", label: "Pixar enfants", icon: "🎨" },
  { id: "noir_cinema", label: "Noir cinéma", icon: "🎬" },
  { id: "anime_90s", label: "Anime 90s", icon: "⚔️" },
  { id: "cyberpunk_neon", label: "Cyberpunk néon", icon: "🌆" },
  { id: "fantasy_epic", label: "Fantasy épique", icon: "🐉" },
  { id: "realistic_drama", label: "Drame réaliste", icon: "🎭" },
  { id: "kids_storybook", label: "Livre enfants", icon: "📖" },
];

export default function CreateSeriesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [pack, setPack] = useState<PackId>("standard_10x5");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"express" | "assisted">("assisted");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [releaseMode, setReleaseMode] = useState<"binge" | "weekly">("binge");
  const [stylePresetId, setStylePresetId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPack = PACKS.find((p) => p.id === pack)!;
  const price = visibility === "public" ? selectedPack.publicPrice : selectedPack.privatePrice;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!prompt.trim()) {
      setError("Décris le pitch de ta série.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/series/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesPackId: pack,
          userPrompt: prompt,
          mode,
          visibility,
          releaseMode,
          stylePresetId: stylePresetId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      router.push(`/dashboard?series=${data.seriesId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return <Centered>Chargement…</Centered>;
  }
  if (!user) {
    return (
      <Centered>
        Connecte-toi.{" "}
        <Link href="/login?redirect=/create/series" className="text-flex-accent underline">
          Se connecter
        </Link>
      </Centered>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/studio"
        className="mb-6 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Retour au studio
      </Link>

      <header className="mb-10 animate-fadeUp">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Nouvelle série
        </div>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          Créer une série
        </h1>
        <p className="mt-3 max-w-2xl text-flex-muted">
          Claude écrit tout l&apos;arc narratif en une passe avec cliffhanger à la
          fin de chaque épisode. La génération vidéo se fait ensuite épisode
          par épisode, en binge ou au rythme d&apos;un épisode par semaine.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-10 rounded-3xl border border-flex-border bg-flex-panel/80 p-8 shadow-cinema backdrop-blur-xl sm:p-10"
      >
        <Section title="Pitch de ta série" hint="Arc narratif sur plusieurs épisodes">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Ex: Dans une ville futuriste, une adolescente découvre qu'elle peut ressentir les émotions des autres — mais à chaque usage, elle perd un souvenir d'elle-même."
            className="w-full resize-none rounded-2xl border border-flex-border bg-flex-surface px-4 py-3 text-base text-flex-text placeholder:text-flex-muted focus:border-flex-accent focus:outline-none focus:ring-2 focus:ring-flex-accent/30"
            maxLength={1500}
          />
          <div className="mt-2 text-right text-xs text-flex-muted">
            {prompt.length}/1500
          </div>
        </Section>

        <Section title="Format">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PACKS.map((p) => {
              const active = pack === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPack(p.id)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    active
                      ? "border-flex-accent bg-flex-accent/10 shadow-glowSm"
                      : "border-flex-border bg-flex-card hover:border-flex-accent/50"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-lg font-display font-bold text-flex-accent">
                      ${(p.publicPrice / 100).toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-flex-muted">
                    <span>{p.totalMinutes} min au total</span>
                    <span>+cliffhangers auto</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Diffusion">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              active={releaseMode === "binge"}
              onClick={() => setReleaseMode("binge")}
              title="Binge"
              desc="Tous les épisodes prêts en même temps"
              icon="📺"
            />
            <Toggle
              active={releaseMode === "weekly"}
              onClick={() => setReleaseMode("weekly")}
              title="Hebdomadaire"
              desc="1 épisode par semaine, cadence Netflix classique"
              icon="📅"
            />
          </div>
        </Section>

        <Section title="Mode de génération">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              active={mode === "assisted"}
              onClick={() => setMode("assisted")}
              title="Assisté"
              desc="Tu valides personnages et synopsis avant que la vidéo démarre"
              icon="🧭"
            />
            <Toggle
              active={mode === "express"}
              onClick={() => setMode("express")}
              title="Express"
              desc="Lancement direct, sans étape de validation"
              icon="⚡"
            />
          </div>
        </Section>

        <Section title="Visibilité">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              active={visibility === "private"}
              onClick={() => setVisibility("private")}
              title="Privé"
              desc="Seul toi peux regarder"
              icon="🔒"
            />
            <Toggle
              active={visibility === "public"}
              onClick={() => setVisibility("public")}
              title="Public"
              desc="Visible dans le catalogue AIflex (suites activables)"
              icon="🌐"
            />
          </div>
        </Section>

        <Section title="Style visuel (optionnel)" hint="Appliqué à tous les épisodes">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {STYLE_PRESETS.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setStylePresetId(s.id)}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  stylePresetId === s.id
                    ? "border-flex-accent bg-flex-accent/10 text-flex-text"
                    : "border-flex-border bg-flex-card text-flex-muted hover:border-flex-accent/50"
                }`}
              >
                <div className="text-base">{s.icon}</div>
                <div className="mt-1 leading-tight">{s.label}</div>
              </button>
            ))}
          </div>
        </Section>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse items-stretch justify-between gap-4 border-t border-flex-border pt-6 sm:flex-row sm:items-center">
          <Link
            href="/studio"
            className="text-sm text-flex-muted hover:text-flex-text"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="group relative overflow-hidden rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-8 py-3.5 font-medium text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="relative z-10">
              {submitting
                ? "Préparation…"
                : `Lancer la série — $${(price / 100).toFixed(2)}`}
            </span>
          </button>
        </div>
      </form>

      <p className="mt-6 text-center text-xs text-flex-muted">
        Claude écrit d&apos;abord la série complète (quelques minutes), puis la
        génération vidéo de chaque épisode démarre.
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-flex-text">
          {title}
        </h2>
        {hint && <span className="text-xs text-flex-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  active,
  onClick,
  title,
  desc,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left transition ${
        active
          ? "border-flex-accent bg-flex-accent/10 shadow-glowSm"
          : "border-flex-border bg-flex-card hover:border-flex-accent/50"
      }`}
    >
      <div className="mb-2 text-2xl">{icon}</div>
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-flex-muted">{desc}</div>
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-flex-muted">
      {children}
    </div>
  );
}
