"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/useAuth";

// Local types kept minimal — we only need what the UI renders.
interface ParentFilm {
  id: string;
  title: string | null;
  synopsis: string | null;
  genre: string | null;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  ownerId: string;
  royaltyPercent: number;
  sequelsUnlockAt: string | null;
}

interface FormatOption {
  value: string;
  label: string;
  priceCents: number;
  durationMin: number;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { value: "episode_5", label: "Épisode 5 min", priceCents: 999, durationMin: 5 },
  { value: "episode_15", label: "Épisode 15 min", priceCents: 2999, durationMin: 15 },
  { value: "short_30", label: "Court-métrage 30 min", priceCents: 5999, durationMin: 30 },
  { value: "film_90", label: "Film 1h30", priceCents: 16999, durationMin: 90 },
];

const STYLE_PRESETS = [
  { id: "", label: "Aucun style imposé", icon: "✨" },
  { id: "pixar_kids", label: "Pixar enfants", icon: "🎨" },
  { id: "noir_cinema", label: "Noir cinéma", icon: "🎬" },
  { id: "anime_90s", label: "Anime 90s", icon: "⚔️" },
  { id: "cyberpunk_neon", label: "Cyberpunk néon", icon: "🌆" },
  { id: "fantasy_epic", label: "Fantasy épique", icon: "🐉" },
  { id: "realistic_drama", label: "Drame réaliste", icon: "🎭" },
];

export default function SequelPage() {
  const { filmId } = useParams<{ filmId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [parent, setParent] = useState<ParentFilm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [format, setFormat] = useState<string>("episode_15");
  const [mode, setMode] = useState<"express" | "assisted">("assisted");
  const [prompt, setPrompt] = useState("");
  const [stylePresetId, setStylePresetId] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    async function loadParent() {
      try {
        const res = await fetch(`/api/projects/${filmId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Film introuvable");
        const data = await res.json();
        const p = data.project ?? data;
        setParent({
          id: p.id,
          title: p.title ?? p.seriesTitle ?? "Sans titre",
          synopsis: p.synopsis ?? p.concept?.synopsis ?? "",
          genre: p.genre,
          thumbnailUrl: p.thumbnailUrl,
          coverUrl: p.coverUrl,
          ownerId: p.ownerId,
          royaltyPercent: p.royaltyPercent ?? 10,
          sequelsUnlockAt: p.sequelsUnlockAt,
        });
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Erreur");
      }
    }
    loadParent();
  }, [filmId]);

  const selectedFormat = FORMAT_OPTIONS.find((f) => f.value === format)!;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!prompt.trim()) {
      setSubmitError("Décris d'abord ta vision pour la suite.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/sequel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentFilmId: filmId,
          format,
          mode,
          userPrompt: prompt,
          stylePresetId: stylePresetId || undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      router.push(`/agent/validate/${data.jobId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-flex-muted">
        Chargement…
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <p className="mb-4 text-lg">Connecte-toi pour générer une suite.</p>
        <Link
          href={`/login?redirect=/sequel/${filmId}`}
          className="inline-block rounded-full bg-flex-accent px-6 py-3 font-medium text-white hover:brightness-110"
        >
          Se connecter
        </Link>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center text-red-400">
        {loadError}
      </div>
    );
  }
  if (!parent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-flex-muted">
        Chargement du film parent…
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-32">
      {parent.coverUrl && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
          <Image
            src={parent.coverUrl}
            alt=""
            fill
            priority
            className="object-cover opacity-30 blur-xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-flex-bg/70 to-flex-bg" />
        </div>
      )}

      <div className="relative mx-auto max-w-5xl px-4 pt-14 sm:px-6 lg:px-8">
        <Link
          href={`/watch/${filmId}`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
        >
          ← Retour à {parent.title}
        </Link>

        <header className="mb-12 flex flex-col items-start gap-8 sm:flex-row">
          <div className="relative h-52 w-36 flex-shrink-0 overflow-hidden rounded-2xl shadow-cinema ring-1 ring-flex-border sm:h-64 sm:w-44">
            {parent.thumbnailUrl ? (
              <Image src={parent.thumbnailUrl} alt={parent.title ?? ""} fill className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-flex-card text-flex-muted">
                —
              </div>
            )}
          </div>
          <div className="flex-1 animate-fadeUp">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
              Générer une suite
            </div>
            <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
              {parent.title}
            </h1>
            <p className="mt-3 max-w-xl text-flex-muted">
              {parent.synopsis || "Continue cet univers à ta manière."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <Chip>Genre : {parent.genre || "—"}</Chip>
              <Chip>Royalty créateur original : {parent.royaltyPercent}%</Chip>
              <Chip>Tu restes propriétaire de ta suite</Chip>
            </div>
          </div>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-10 rounded-3xl border border-flex-border bg-flex-panel/80 p-8 shadow-cinema backdrop-blur-xl sm:p-10"
        >
          <Section
            title="Ta vision de la suite"
            hint="Que se passe-t-il après la fin du film original ?"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Ex: trois mois plus tard, l'héroïne reprend sa quête mais découvre que son mentor la trahit…"
              className="w-full resize-none rounded-2xl border border-flex-border bg-flex-surface px-4 py-3 text-base text-flex-text placeholder:text-flex-muted focus:border-flex-accent focus:outline-none focus:ring-2 focus:ring-flex-accent/30"
              maxLength={1500}
            />
            <div className="mt-2 text-right text-xs text-flex-muted">
              {prompt.length}/1500
            </div>
          </Section>

          <Section title="Format" hint="Durée de la suite — impacte le prix">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FORMAT_OPTIONS.map((f) => {
                const active = format === f.value;
                return (
                  <button
                    type="button"
                    key={f.value}
                    onClick={() => setFormat(f.value)}
                    className={`group rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-flex-accent bg-flex-accent/10 shadow-glowSm"
                        : "border-flex-border bg-flex-card hover:border-flex-accent/50"
                    }`}
                  >
                    <div className="text-sm font-medium">{f.label}</div>
                    <div className="mt-1 text-xs text-flex-muted">
                      {f.durationMin} min
                    </div>
                    <div className="mt-3 text-lg font-display font-bold text-flex-accent">
                      ${(f.priceCents / 100).toFixed(2)}
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Mode de génération">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModeCard
                active={mode === "assisted"}
                onClick={() => setMode("assisted")}
                title="Assisté"
                desc="Tu valides les personnages et le synopsis avant que la génération vidéo ne démarre. Recommandé."
                icon="🧭"
              />
              <ModeCard
                active={mode === "express"}
                onClick={() => setMode("express")}
                title="Express"
                desc="Lancement direct. Plus rapide mais sans étape de validation."
                icon="⚡"
              />
            </div>
          </Section>

          <Section title="Style visuel (optionnel)" hint="Appliqué à toutes les scènes">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
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

          <Section
            title="Programmer (optionnel)"
            hint="Heure à laquelle tu veux que ce soit prêt"
          >
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="rounded-2xl border border-flex-border bg-flex-surface px-4 py-3 text-flex-text focus:border-flex-accent focus:outline-none"
            />
          </Section>

          {submitError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {submitError}
            </div>
          )}

          <div className="flex flex-col-reverse items-stretch justify-between gap-4 border-t border-flex-border pt-6 sm:flex-row sm:items-center">
            <Link
              href={`/watch/${filmId}`}
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
                  : `Lancer — $${(selectedFormat.priceCents / 100).toFixed(2)}`}
              </span>
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-flex-muted">
          En continuant, tu acceptes que {parent.royaltyPercent}% de tes revenus de vue
          soient reversés au créateur original via royalty. Le créateur peut désavouer
          ta suite.
        </p>
      </div>
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-flex-border bg-flex-card px-3 py-1 text-flex-muted">
      {children}
    </span>
  );
}

function ModeCard({
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
