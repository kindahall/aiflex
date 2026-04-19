"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import TypeWriter from "@/components/TypeWriter";
import { createProject } from "@/lib/client-api";
import { useAuth } from "@/lib/useAuth";
import type { Format, Genre, Tone } from "@/lib/types";

// Extend types strictly for local UI display
interface VisualItem {
  value: string;
  label: string;
  icon?: string;
  hint?: string;
  image?: string;
}

const GENRES: VisualItem[] = [
  { value: "sci-fi", label: "Sci-fi", icon: "🚀", image: "/assets/studio/genre_scifi.png" },
  { value: "fantasy", label: "Fantasy", icon: "🐉", image: "/assets/studio/genre_fantasy.png" },
  { value: "thriller", label: "Thriller", icon: "🔪", image: "/assets/studio/genre_thriller.png" },
  { value: "romance", label: "Romance", icon: "💘", image: "/assets/studio/genre_romance.png" },
  { value: "horror", label: "Horreur", icon: "👻", image: "/assets/studio/genre_horror.png" },
  { value: "drama", label: "Drame", icon: "🎭", image: "/assets/studio/genre_drama.png" },
  { value: "comedy", label: "Comédie", icon: "😂", image: "/assets/studio/genre_comedy.png" },
  { value: "action", label: "Action", icon: "💥", image: "/assets/studio/genre_action.png" },
  { value: "anime", label: "Anime", icon: "⚔️", image: "/assets/studio/genre_anime.png" },
  { value: "noir", label: "Polar", icon: "🕵", image: "/assets/studio/genre_noir.png" },
  { value: "western", label: "Western", icon: "🤠", image: "/assets/studio/genre_western.png" },
  {
    value: "documentary",
    label: "Docu",
    icon: "📹",
    image: "/assets/studio/genre_documentary.png",
  },
];

const FORMATS: VisualItem[] = [
  {
    value: "court-metrage",
    label: "Court-métrage",
    hint: "8–14 scènes, 2 min",
    image: "/assets/studio/format_short.png",
  },
  {
    value: "long-metrage",
    label: "Long-métrage",
    hint: "12–20 scènes, 3 min",
    image: "/assets/studio/format_long.png",
  },
  {
    value: "mini-serie",
    label: "Mini-série",
    hint: "Pilote + arc",
    image: "/assets/studio/format_series.png",
  },
  {
    value: "anime-episode",
    label: "Épisode anime",
    hint: "Format 24 min",
    image: "/assets/studio/format_anime_ep.png",
  },
  {
    value: "clip",
    label: "Clip musical",
    hint: "Narratif court",
    image: "/assets/studio/format_clip.png",
  },
  {
    value: "trailer",
    label: "Trailer",
    hint: "Bande-annonce concept",
    image: "/assets/studio/format_trailer.png",
  },
];

const TONES: VisualItem[] = [
  { value: "epique", label: "Épique", icon: "⚡", image: "/assets/studio/tone_epique.png" },
  { value: "sombre", label: "Sombre", icon: "🌑", image: "/assets/studio/tone_sombre.png" },
  { value: "onirique", label: "Onirique", icon: "☁️", image: "/assets/studio/tone_onirique.png" },
  { value: "comique", label: "Comique", icon: "😄", image: "/assets/studio/tone_comique.png" },
  { value: "tendu", label: "Tendu", icon: "😰", image: "/assets/studio/tone_tendu.png" },
  { value: "intime", label: "Intime", icon: "🤫", image: "/assets/studio/tone_intime.png" },
  {
    value: "apocalyptique",
    label: "Apocalyptique",
    icon: "🌋",
    image: "/assets/studio/tone_apocalyptique.png",
  },
  {
    value: "nostalgique",
    label: "Nostalgique",
    icon: "📼",
    image: "/assets/studio/tone_nostalgique.png",
  },
];

const EXAMPLES = [
  "Une archéologue découvre qu'un temple englouti envoie des rêves aux enfants du monde entier. Elle doit décider si elle le réveille.",
  "Dans un futur proche, les souvenirs se vendent aux enchères. Un ancien flic rachète les siens et comprend qu'il est coupable.",
  "Deux sœurs reçoivent la même lettre d'un père qu'elles croyaient mort, les invitant à se rencontrer dans une gare abandonnée.",
];

// Handles offline mode or external API failures gracefully
function CardBackground({ item }: { item: VisualItem }) {
  const [error, setError] = useState(false);

  if (!item.image || error) {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-flex-surface to-[rgb(var(--flex-bg))]/50 group-hover:from-flex-accent/10 group-hover:to-[rgb(var(--flex-bg))]/50 transition-colors duration-500" />
    );
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-10 transition-opacity duration-500 group-hover:bg-black/10" />
      <img
        src={item.image}
        alt={item.label}
        onError={() => setError(true)}
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110 bg-flex-panel"
      />
    </>
  );
}

function CardGrid({
  items,
  currentValue,
  onSelect,
  aspectRatio = "aspect-square",
}: {
  items: VisualItem[];
  currentValue: string;
  onSelect: (val: string) => void;
  aspectRatio?: string;
}) {
  return (
    <div className="hide-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:gap-4 sm:px-6 sm:pb-4 md:mx-0 md:grid md:snap-none md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-6">
      {items.map((item) => {
        const active = currentValue === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className={`group relative w-[46vw] max-w-[220px] shrink-0 snap-center overflow-hidden rounded-2xl border text-left transition-all duration-300 sm:w-56 md:w-auto md:snap-none ${aspectRatio} ${
              active
                ? "z-10 scale-[1.02] border-flex-accent shadow-[0_0_20px_rgba(var(--flex-accent)/0.3)]"
                : "border-white/5 hover:scale-[1.02] hover:border-flex-accent/50 active:scale-[0.98]"
            }`}
          >
            {/* Background Layer */}
            <div className="absolute inset-0 z-0 overflow-hidden rounded-2xl bg-flex-panel">
              <CardBackground item={item} />
            </div>

            {/* Content Layer (Gradient Overlay on text) */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 sm:p-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {item.icon && (
                  <span className="text-lg drop-shadow-md sm:text-xl">{item.icon}</span>
                )}
                <span className="text-[13px] font-bold tracking-wide text-white drop-shadow-md sm:text-sm">
                  {item.label}
                </span>
              </div>
              {item.hint && (
                <div className="mt-1 text-[9px] uppercase tracking-widest text-white/70 line-clamp-2 sm:text-[10px]">
                  {item.hint}
                </div>
              )}
            </div>

            {/* Active Glow overlay */}
            {active && (
              <div className="pointer-events-none absolute inset-0 z-30 rounded-2xl ring-2 ring-inset ring-flex-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}

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
  const [inputFocused, setInputFocused] = useState(false);

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
    <div className="relative min-h-screen w-full bg-flex-bg pb-12 text-flex-text selection:bg-flex-accent/30 selection:text-flex-accent sm:pb-24">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-full max-w-4xl -translate-x-1/2 bg-flex-accent/5 blur-[80px] sm:h-[600px] sm:blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
        {/* Header Section */}
        <div className="mb-10 text-center animate-fadeUp sm:mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-flex-accent backdrop-blur-md sm:px-4 sm:text-[10px] sm:tracking-[0.3em]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-flex-accent opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-flex-accent"></span>
            </span>
            Studio IA AIflex
          </div>
          <h1 className="mb-5 text-[2rem] leading-[1.1] font-black tracking-tight sm:mb-6 sm:text-5xl sm:leading-tight sm:tracking-tighter md:text-7xl">
            Donne-nous une idée.
            <br className="hidden sm:block" />
            <span className="mt-2 block bg-gradient-to-r from-flex-accent to-flex-accent2 bg-clip-text text-transparent sm:mt-0 sm:inline">
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
          <p className="mx-auto max-w-2xl px-2 text-sm leading-relaxed font-light text-flex-muted/80 sm:px-0 sm:text-base md:text-lg">
            Écris une idée — même vague. Notre intelligence artificielle construit le concept
            narratif, découpe le scénario en scènes et génère chaque plan vidéo pour toi.
          </p>
        </div>

        {/* Main Prompt Bar Section */}
        <div
          className="mx-auto mb-12 max-w-4xl animate-fadeUp sm:mb-16"
          style={{ animationDelay: "100ms" }}
        >
          <div
            className={`relative overflow-hidden rounded-2xl transition-all duration-500 sm:rounded-3xl ${
              inputFocused
                ? "scale-[1.01] bg-flex-card shadow-[0_0_40px_rgba(var(--flex-accent)/0.15)]"
                : "glass-panel border-white/5 bg-flex-panel"
            }`}
          >
            <div
              className={`pointer-events-none absolute inset-0 rounded-2xl border transition-opacity duration-500 sm:rounded-3xl ${
                inputFocused ? "border-flex-accent/50 opacity-100" : "border-white/10 opacity-0"
              }`}
            />

            <div className="p-1">
              <textarea
                id="idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Raconte ton histoire... Un hacker découvre que notre univers tourne sur un serveur quantique mourant."
                className="w-full resize-none border-none bg-transparent p-4 text-base text-flex-text placeholder:text-flex-muted/50 focus:ring-0 sm:p-6 sm:text-lg md:text-xl"
                rows={idea.length > 100 || inputFocused ? 6 : 3}
              />
            </div>

            {/* Prompt bar footer (examples & char count) */}
            <div className="flex flex-col gap-3 border-t border-white/5 bg-black/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
              <div className="hide-scrollbar flex gap-2 overflow-x-auto sm:w-auto">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIdea(ex)}
                    className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-flex-muted transition-all hover:border-flex-accent hover:text-white sm:px-4"
                  >
                    Exemple {i + 1}
                  </button>
                ))}
              </div>

              <div className="hidden shrink-0 items-center gap-4 text-[11px] text-flex-muted sm:flex sm:text-xs">
                <span className={idea.length > 200 ? "text-flex-accent" : ""}>
                  {idea.length} car.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Categories / Visual Configuration Form */}
        <div
          className="animate-fadeUp space-y-10 sm:space-y-16"
          style={{ animationDelay: "200ms" }}
        >
          <section>
            <div className="mb-3 sm:mb-4">
              <h3 className="text-base font-bold tracking-tight sm:text-xl">
                Que réalisons-nous ? <span className="font-normal text-flex-muted">— Format</span>
              </h3>
            </div>
            <CardGrid
              items={FORMATS}
              currentValue={format}
              onSelect={(val) => setFormat(val as Format)}
              aspectRatio="aspect-video"
            />
          </section>

          <section>
            <div className="mb-3 sm:mb-4">
              <h3 className="text-base font-bold tracking-tight sm:text-xl">
                Dans quel univers ? <span className="font-normal text-flex-muted">— Genre</span>
              </h3>
            </div>
            <CardGrid
              items={GENRES}
              currentValue={genre}
              onSelect={(val) => setGenre(val as Genre)}
              aspectRatio="aspect-[4/5]"
            />
          </section>

          <section>
            <div className="mb-3 sm:mb-4">
              <h3 className="text-base font-bold tracking-tight sm:text-xl">
                Quelle est l&apos;ambiance ?{" "}
                <span className="font-normal text-flex-muted">— Ton</span>
              </h3>
            </div>
            <CardGrid
              items={TONES}
              currentValue={tone}
              onSelect={(val) => setTone(val as Tone)}
              aspectRatio="aspect-video md:aspect-[3/1]"
            />
          </section>

          <section className="mx-auto max-w-4xl">
            <div className="mb-3 sm:mb-4">
              <h3 className="mb-1 text-base font-bold tracking-tight sm:text-xl">
                Une fin particulière en tête ?{" "}
                <span className="font-normal text-flex-muted">(Optionnel)</span>
              </h3>
              <p className="text-xs text-flex-muted sm:text-sm">
                Donnez une direction au dénouement de l&apos;histoire pour guider l&apos;écriture.
              </p>
            </div>
            <input
              id="ending"
              value={endingHint}
              onChange={(e) => setEndingHint(e.target.value)}
              placeholder="Ex : une fin ouverte et tragique, une révélation mystérieuse, un plot twist..."
              className="glass-panel w-full rounded-xl border border-white/5 bg-flex-panel px-4 py-3 text-sm focus:border-flex-accent focus:shadow-[0_0_20px_rgba(var(--flex-accent)/0.2)] sm:px-5 sm:py-4 sm:text-base"
            />
          </section>
        </div>

        {error && (
          <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-200 animate-fadeIn sm:mt-12 sm:p-4 sm:text-sm">
            ⚠ {error}
          </div>
        )}

        {/* Launch Action — inline in flow on mobile, sticky on desktop */}
        <div className="mt-10 flex justify-center sm:sticky sm:bottom-6 sm:z-50 sm:mt-16 sm:pb-6">
          <div className="relative w-full sm:w-auto">
            {/* Ambient glow behind button — desktop only so it doesn't cover mobile content */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 hidden h-[80px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-flex-accent/40 blur-[40px] sm:block" />
            <button
              type="button"
              onClick={launch}
              disabled={!idea.trim() || busy}
              className="group relative w-full overflow-hidden rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-6 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-[0_0_30px_-10px_rgb(var(--flex-accent))] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_60px_-10px_rgb(var(--flex-accent))] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none sm:w-auto sm:px-12 sm:py-5 sm:text-lg sm:tracking-widest sm:shadow-[0_0_40px_-10px_rgb(var(--flex-accent))]"
            >
              <div className="absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/10" />
              {busy ? (
                <span className="relative flex items-center justify-center gap-2 sm:gap-3">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-5 w-5 animate-spin sm:h-6 sm:w-6"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      opacity="0.25"
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  Création…
                </span>
              ) : (
                <span className="relative flex items-center justify-center gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl">🪄</span>
                  Générer mon projet
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
