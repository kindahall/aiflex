"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import TypeWriter from "@/components/TypeWriter";
import { createProject } from "@/lib/client-api";
import { useAuth } from "@/lib/useAuth";
import type { Format, Genre, Tone } from "@/lib/types";
import Image from "next/image";

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
  { value: "thriller", label: "Thriller", icon: "🔪", image: "https://images.unsplash.com/photo-1505322022379-7c3353ee6291?w=400&q=80" },
  { value: "romance", label: "Romance", icon: "💘", image: "https://images.unsplash.com/photo-1474552226712-ac0f0961a954?w=400&q=80" },
  { value: "horror", label: "Horreur", icon: "👻", image: "https://images.unsplash.com/photo-1505635558504-1f191b9f6974?w=400&q=80" },
  { value: "drama", label: "Drame", icon: "🎭", image: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=400&q=80" },
  { value: "comedy", label: "Comédie", icon: "😂", image: "https://images.unsplash.com/photo-1523480717984-24cba35ae1ef?w=400&q=80" },
  { value: "action", label: "Action", icon: "💥", image: "https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?w=400&q=80" },
  { value: "anime", label: "Anime", icon: "⚔️", image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80" },
  { value: "noir", label: "Polar", icon: "🕵", image: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&q=80" },
  { value: "western", label: "Western", icon: "🤠", image: "https://images.unsplash.com/photo-1482881497185-d4a9ddbe4151?w=400&q=80" },
  { value: "documentary", label: "Docu", icon: "📹", image: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=400&q=80" },
];

const FORMATS: VisualItem[] = [
  { value: "court-metrage", label: "Court-métrage", hint: "8–14 scènes, 2 min", image: "/assets/studio/format_short.png" },
  { value: "long-metrage", label: "Long-métrage", hint: "12–20 scènes, 3 min", image: "/assets/studio/format_long.png" },
  { value: "mini-serie", label: "Mini-série", hint: "Pilote + arc", image: "/assets/studio/format_series.png" },
  { value: "anime-episode", label: "Épisode anime", hint: "Format 24 min", image: "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=600&q=80" },
  { value: "clip", label: "Clip musical", hint: "Narratif court", image: "/assets/studio/format_clip.png" },
  { value: "trailer", label: "Trailer", hint: "Bande-annonce concept", image: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&q=80" },
];

const TONES: VisualItem[] = [
  { value: "epique", label: "Épique", icon: "⚡", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80" },
  { value: "sombre", label: "Sombre", icon: "🌑", image: "https://images.unsplash.com/photo-1509266272358-7701da638078?w=400&q=80" },
  { value: "onirique", label: "Onirique", icon: "☁️", image: "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=400&q=80" },
  { value: "comique", label: "Comique", icon: "😄", image: "https://images.unsplash.com/photo-1545987796-200677ee10fc?w=400&q=80" },
  { value: "tendu", label: "Tendu", icon: "😰", image: "https://images.unsplash.com/photo-1508614999368-9260051292e5?w=400&q=80" },
  { value: "intime", label: "Intime", icon: "🤫", image: "https://images.unsplash.com/photo-1516585427167-9f4af9627e6c?w=400&q=80" },
  { value: "apocalyptique", label: "Apocalyptique", icon: "🌋", image: "https://images.unsplash.com/photo-1485081669829-bacb8c7bb1f3?w=400&q=80" },
  { value: "nostalgique", label: "Nostalgique", icon: "📼", image: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&q=80" },
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
    <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-4 md:grid md:grid-cols-4 lg:grid-cols-6 md:pb-0 md:overflow-visible md:snap-none">
      {items.map((item) => {
        const active = currentValue === item.value;
        return (
          <button
            key={item.value}
            type="button"
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className={`group relative overflow-hidden rounded-2xl border text-left transition-all duration-300 shrink-0 w-40 sm:w-48 md:w-auto snap-center md:snap-none ${aspectRatio} ${
              active
                ? "border-flex-accent scale-[1.02] shadow-[0_0_20px_rgba(var(--flex-accent)/0.3)] z-10"
                : "border-white/5 hover:border-flex-accent/50 hover:scale-[1.02]"
            }`}
          >
            {/* Background Layer */}
            <div className="absolute inset-0 z-0 bg-flex-panel overflow-hidden rounded-2xl">
              <CardBackground item={item} />
            </div>

            {/* Content Layer (Gradient Overlay on text) */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
              <div className="flex items-center gap-2">
                {item.icon && <span className="text-xl drop-shadow-md">{item.icon}</span>}
                <span className="font-bold text-white text-sm tracking-wide drop-shadow-md">
                  {item.label}
                </span>
              </div>
              {item.hint && (
                <div className="mt-1 text-[10px] uppercase tracking-widest text-white/70 line-clamp-2">
                  {item.hint}
                </div>
              )}
            </div>

            {/* Active Glow overlay */}
            {active && (
              <div className="absolute inset-0 z-30 rounded-2xl ring-2 ring-flex-accent ring-inset pointer-events-none" />
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
    <div className="relative min-h-screen w-full bg-flex-bg text-flex-text selection:bg-flex-accent/30 selection:text-flex-accent pb-24">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[600px] w-full max-w-4xl -translate-x-1/2 bg-flex-accent/5 blur-[120px]" />
      
      <div className="relative mx-auto max-w-6xl px-6 pt-24">
        {/* Header Section */}
        <div className="mb-12 text-center animate-fadeUp">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-flex-accent backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-flex-accent opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-flex-accent"></span>
            </span>
            Studio IA AIflex
          </div>
          <h1 className="mb-6 text-4xl sm:text-5xl md:text-7xl font-black leading-tight tracking-tighter">
            Donne-nous une idée.<br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-flex-accent to-flex-accent2 block sm:inline mt-2 sm:mt-0">
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
          <p className="mx-auto max-w-2xl text-lg text-flex-muted/80 leading-relaxed font-light">
            Écris une idée — même vague. Notre intelligence artificielle construit le concept narratif, découpe le scénario en scènes et génère chaque plan vidéo pour toi.
          </p>
        </div>

        {/* Main Prompt Bar Section */}
        <div className="mx-auto max-w-4xl mb-16 animate-fadeUp" style={{ animationDelay: "100ms" }}>
          <div 
            className={`relative rounded-3xl transition-all duration-500 overflow-hidden ${
              inputFocused 
                ? "bg-flex-card shadow-[0_0_40px_rgba(var(--flex-accent)/0.15)] scale-[1.01]" 
                : "bg-flex-panel glass-panel border-white/5"
            }`}
          >
            <div className={`absolute inset-0 rounded-3xl transition-opacity duration-500 border pointer-events-none ${inputFocused ? "border-flex-accent/50 opacity-100" : "border-white/10 opacity-0"}`} />
            
            <div className="p-1">
              <textarea
                id="idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Raconte ton histoire... Un hacker découvre que notre univers tourne sur un serveur quantique mourant."
                className="w-full resize-none border-none bg-transparent p-6 text-lg md:text-xl text-flex-text placeholder:text-flex-muted/50 focus:ring-0"
                rows={idea.length > 100 || inputFocused ? 6 : 3}
              />
            </div>
            
            {/* Prompt bar footer (examples & char count) */}
             <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/5 bg-black/10 px-6 py-4">
               <div className="flex gap-2 w-full md:w-auto overflow-x-auto hide-scrollbar">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIdea(ex)}
                      className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-medium text-flex-muted hover:border-flex-accent hover:text-white transition-all"
                    >
                      Exemple {i + 1}
                    </button>
                  ))}
               </div>
               
               <div className="flex items-center gap-4 shrink-0 text-xs text-flex-muted">
                  <span className={`${idea.length > 200 ? 'text-flex-accent' : ''}`}>
                    {idea.length} act
                  </span>
               </div>
            </div>
          </div>
        </div>

        {/* Categories / Visual Configuration Form */}
        <div className="animate-fadeUp space-y-16" style={{ animationDelay: "200ms" }}>
          
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold tracking-tight">Que réalisons-nous ? <span className="text-flex-muted font-normal">— Format</span></h3>
            </div>
            <CardGrid 
              items={FORMATS} 
              currentValue={format} 
              onSelect={(val) => setFormat(val as Format)}
              aspectRatio="aspect-video"
            />
          </section>

          <section>
             <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold tracking-tight">Dans quel univers ? <span className="text-flex-muted font-normal">— Genre</span></h3>
            </div>
            <CardGrid 
              items={GENRES} 
              currentValue={genre} 
              onSelect={(val) => setGenre(val as Genre)}
              aspectRatio="aspect-[4/5]"
            />
          </section>
          
          <section>
             <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold tracking-tight">Quelle est l&apos;ambiance ? <span className="text-flex-muted font-normal">— Ton</span></h3>
            </div>
             <CardGrid 
              items={TONES} 
              currentValue={tone} 
              onSelect={(val) => setTone(val as Tone)}
              aspectRatio="aspect-video md:aspect-[3/1]" 
            />
          </section>

           <section className="mx-auto max-w-4xl">
              <div className="mb-4">
                 <h3 className="text-xl font-bold tracking-tight mb-1">Une fin particulière en tête ? <span className="text-flex-muted font-normal">(Optionnel)</span></h3>
                 <p className="text-sm text-flex-muted">Donnez une direction au dénouement de l&apos;histoire pour guider l&apos;écriture.</p>
              </div>
              <input
                id="ending"
                value={endingHint}
                onChange={(e) => setEndingHint(e.target.value)}
                placeholder="Ex : une fin ouverte et tragique, une révélation mystérieuse, un plot twist..."
                className="w-full bg-flex-panel glass-panel border border-white/5 rounded-xl px-5 py-4 text-base focus:border-flex-accent focus:shadow-[0_0_20px_rgba(var(--flex-accent)/0.2)]"
              />
          </section>
        </div>

        {error && (
          <div className="mt-12 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-200 animate-fadeIn">
            ⚠ {error}
          </div>
        )}

        {/* Launch Action */}
        <div className="mt-16 sticky bottom-6 z-50 flex justify-center pb-6">
           {/* Ambient glow behind button */}
           <div className="absolute inset-0 top-1/2 -z-10 h-[80px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-flex-accent/40 blur-[40px]" />
           <button
            type="button"
            onClick={launch}
            disabled={!idea.trim() || busy}
            className="group relative overflow-hidden rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-12 py-5 text-lg font-bold uppercase tracking-widest text-white shadow-[0_0_40px_-10px_rgb(var(--flex-accent))] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_60px_-10px_rgb(var(--flex-accent))] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
          >
            <div className="absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/10" />
            {busy ? (
              <span className="relative flex items-center justify-center gap-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="animate-spin">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                Création de l&apos;univers…
              </span>
            ) : (
              <span className="relative flex items-center gap-3">
                <span className="text-2xl">🪄</span>
                Générer mon projet
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
