"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import TypeWriter from "@/components/TypeWriter";
import { createProject } from "@/lib/client-api";
import { useAuth } from "@/lib/useAuth";
import type { Format, Genre, Tone } from "@/lib/types";

const GENRES: { value: Genre; label: string; icon: string }[] = [
  { value: "sci-fi", label: "Sci-fi", icon: "🚀" },
  { value: "fantasy", label: "Fantasy", icon: "🐉" },
  { value: "thriller", label: "Thriller", icon: "🔪" },
  { value: "romance", label: "Romance", icon: "💘" },
  { value: "horror", label: "Horreur", icon: "👻" },
  { value: "drama", label: "Drame", icon: "🎭" },
  { value: "comedy", label: "Comédie", icon: "😂" },
  { value: "action", label: "Action", icon: "💥" },
  { value: "anime", label: "Anime", icon: "⚔️" },
  { value: "noir", label: "Polar", icon: "🕵" },
  { value: "western", label: "Western", icon: "🤠" },
  { value: "documentary", label: "Docu", icon: "📹" },
];

const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: "court-metrage", label: "Court-métrage", hint: "8–14 scènes, 2 min" },
  { value: "long-metrage", label: "Long-métrage", hint: "12–20 scènes, 3 min" },
  { value: "mini-serie", label: "Mini-série", hint: "Pilote + arc" },
  { value: "anime-episode", label: "Épisode anime", hint: "Format 24 min" },
  { value: "clip", label: "Clip musical", hint: "Narratif court" },
  { value: "trailer", label: "Trailer", hint: "Bande-annonce concept" },
];

const TONES: { value: Tone; label: string; icon: string }[] = [
  { value: "epique", label: "Épique", icon: "⚡" },
  { value: "sombre", label: "Sombre", icon: "🌑" },
  { value: "onirique", label: "Onirique", icon: "☁️" },
  { value: "comique", label: "Comique", icon: "😄" },
  { value: "tendu", label: "Tendu", icon: "😰" },
  { value: "intime", label: "Intime", icon: "🤫" },
  { value: "apocalyptique", label: "Apocalyptique", icon: "🌋" },
  { value: "nostalgique", label: "Nostalgique", icon: "📼" },
];

const EXAMPLES = [
  "Une archéologue découvre qu'un temple englouti envoie des rêves aux enfants du monde entier. Elle doit décider si elle le réveille.",
  "Dans un futur proche, les souvenirs se vendent aux enchères. Un ancien flic rachète les siens et comprend qu'il est coupable.",
  "Deux sœurs reçoivent la même lettre d'un père qu'elles croyaient mort, les invitant à se rencontrer dans une gare abandonnée.",
];

export default function StudioEntryPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [idea, setIdea] = useState("");
  const [genre, setGenre] = useState<Genre>("sci-fi");
  const [format, setFormat] = useState<Format>("court-metrage");
  const [tone, setTone] = useState<Tone>("onirique");
  const [endingHint, setEndingHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login?next=/studio");
  }, [loading, user, router]);

  async function launch() {
    if (!idea.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createProject({
        idea: idea.trim(),
        genre,
        format,
        tone,
        endingHint: endingHint.trim() || undefined,
      });
      router.push(`/studio/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20">
        <LoadingPulse label="Ouverture du studio" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Studio IA AIflex
      </div>
      <h1 className="mb-3 text-5xl font-black leading-tight tracking-tight">
        Donne-nous une idée.<br />
        <span className="text-flex-accent">
          On en fait{" "}
          <TypeWriter
            words={[
              "un film.",
              "une série.",
              "un trailer.",
              "un court-métrage.",
              "un anime.",
              "un documentaire.",
            ]}
          />
        </span>
      </h1>
      <p className="mb-10 max-w-2xl text-base leading-relaxed text-flex-muted">
        Écris une idée — même vague. Notre IA construit le concept, le scénario
        et les scènes, puis génère chaque plan en vidéo automatiquement.
      </p>

      <div className="space-y-6 rounded-3xl border border-flex-border bg-flex-card p-8 shadow-cinema">
        <div>
          <div className="flex items-end justify-between">
            <label htmlFor="idea">Ton idée</label>
            <span
              className={`text-[10px] font-medium transition-colors ${
                idea.length > 500
                  ? "text-flex-accent"
                  : idea.length > 0
                    ? "text-flex-muted"
                    : "text-transparent"
              }`}
            >
              {idea.length} caractères
              {idea.length > 50 && idea.length < 200 && " — essaie d'en dire plus"}
              {idea.length >= 200 && " — parfait"}
            </span>
          </div>
          <textarea
            id="idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Raconte ton histoire en quelques phrases. Quel est le monde ? Qui sont les personnages ? Quel est le conflit ?"
            rows={5}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdea(ex)}
                className="group/ex flex items-center gap-1.5 rounded-full border border-flex-border bg-flex-panel px-4 py-1.5 text-[11px] text-flex-muted transition-all duration-200 hover:scale-105 hover:border-flex-accent hover:bg-flex-accent/5 hover:text-flex-text hover:shadow-sm"
              >
                <span className="text-flex-accent opacity-0 transition group-hover/ex:opacity-100">
                  ✦
                </span>
                Exemple {i + 1}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label>Genre</label>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => {
              const active = genre === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGenre(g.value)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-150 ${
                    active
                      ? "border-flex-accent bg-flex-accent/10 text-flex-accent shadow-sm scale-105"
                      : "border-flex-border bg-flex-card text-flex-muted hover:border-flex-accent/50 hover:text-flex-text"
                  }`}
                >
                  <span className="text-base">{g.icon}</span>
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="format">Format</label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label} — {f.hint}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Ton</label>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => {
                const active = tone === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTone(t.value)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                      active
                        ? "border-flex-accent bg-flex-accent/10 text-flex-accent shadow-sm scale-105"
                        : "border-flex-border bg-flex-card text-flex-muted hover:border-flex-accent/50 hover:text-flex-text"
                    }`}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="ending">Fin souhaitée (optionnel)</label>
          <input
            id="ending"
            value={endingHint}
            onChange={(e) => setEndingHint(e.target.value)}
            placeholder="Ex : ouverte, tragique, mystérieuse, libératrice…"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            ⚠ {error}
          </div>
        )}

        <button
          type="button"
          onClick={launch}
          disabled={!idea.trim() || busy}
          className="group w-full rounded-xl bg-flex-accent py-4 text-base font-bold uppercase tracking-widest text-white shadow-[0_10px_40px_-10px_rgb(var(--flex-accent)/0.4)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_20px_60px_-10px_rgb(var(--flex-accent)/0.5)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              Création du projet…
            </span>
          ) : (
            "✦ Lancer la co-création"
          )}
        </button>
      </div>
    </div>
  );
}
