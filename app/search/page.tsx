"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import type { Genre } from "@/lib/types";

interface Hit {
  id: string;
  source: "community" | "catalog";
  title: string;
  tagline: string;
  description: string;
  genre: string;
  coverUrl: string;
  author: string;
  durationMin: number;
  rating?: number;
  year?: number;
  likes?: number;
  views?: number;
  href: string;
}

const GENRES: { value: Genre | ""; label: string }[] = [
  { value: "", label: "Tous les genres" },
  { value: "sci-fi", label: "Science-fiction" },
  { value: "fantasy", label: "Fantasy" },
  { value: "thriller", label: "Thriller" },
  { value: "romance", label: "Romance" },
  { value: "horror", label: "Horreur" },
  { value: "drama", label: "Drame" },
  { value: "comedy", label: "Comédie" },
  { value: "action", label: "Action" },
  { value: "anime", label: "Anime / Manga" },
  { value: "noir", label: "Polar / Noir" },
  { value: "western", label: "Western" },
  { value: "documentary", label: "Documentaire" },
];

const SOURCES = [
  { value: "all", label: "Tout" },
  { value: "community", label: "Communauté" },
  { value: "catalog", label: "Catalogue démo" },
] as const;

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-6 py-20" />}>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params?.get("q") || "");
  const [genre, setGenre] = useState<Genre | "">(
    (params?.get("genre") as Genre | null) || ""
  );
  const [source, setSource] = useState<"all" | "community" | "catalog">(
    (params?.get("source") as "all" | "community" | "catalog") || "all"
  );
  const [sort, setSort] = useState<"pertinence" | "recent" | "populaire">(
    (params?.get("sort") as "pertinence" | "recent" | "populaire") || "pertinence"
  );
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/search", window.location.origin);
      if (q) url.searchParams.set("q", q);
      if (genre) url.searchParams.set("genre", genre);
      if (source !== "all") url.searchParams.set("source", source);
      if (sort !== "pertinence") url.searchParams.set("sort", sort);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setHits(data.hits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, [q, genre, source, sort]);

  // Initial load + refetch on filter change. URL stays in sync so the
  // search is shareable.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    url.searchParams.delete("genre");
    url.searchParams.delete("source");
    url.searchParams.delete("sort");
    if (q) url.searchParams.set("q", q);
    if (genre) url.searchParams.set("genre", genre);
    if (source !== "all") url.searchParams.set("source", source);
    if (sort !== "pertinence") url.searchParams.set("sort", sort);
    router.replace(`/search${url.search}`, { scroll: false });
    fetchResults();
  }, [q, genre, source, fetchResults, router]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Recherche
      </div>
      <h1 className="mb-6 text-4xl font-black tracking-tight">
        Trouve ton prochain film
      </h1>

      <div className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-flex-border bg-flex-card p-4">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="!mb-1 !text-[10px] !uppercase">
            Mot-clé
          </label>
          <input
            id="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Titre, ambiance, créateur…"
          />
        </div>
        <div>
          <label htmlFor="genre" className="!mb-1 !text-[10px] !uppercase">
            Genre
          </label>
          <select
            id="genre"
            value={genre}
            onChange={(e) => setGenre(e.target.value as Genre | "")}
            className="!w-auto"
          >
            {GENRES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="source" className="!mb-1 !text-[10px] !uppercase">
            Source
          </label>
          <select
            id="source"
            value={source}
            onChange={(e) =>
              setSource(e.target.value as "all" | "community" | "catalog")
            }
            className="!w-auto"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="!mb-1 !text-[10px] !uppercase">
            Trier par
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as "pertinence" | "recent" | "populaire")
            }
            className="!w-auto"
          >
            <option value="pertinence">Pertinence</option>
            <option value="recent">Plus récent</option>
            <option value="populaire">Plus populaire</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          ⚠ {error}
        </div>
      )}

      {loading && hits === null && <LoadingPulse label="Recherche en cours" />}

      {hits && hits.length === 0 && !loading && (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-12 text-center">
          <div className="mb-3 text-4xl">🔍</div>
          <h3 className="mb-2 text-lg font-bold">Aucun résultat</h3>
          <p className="mx-auto mb-4 max-w-md text-sm text-flex-muted">
            Aucun film ne correspond à ta recherche. Essaie un autre mot-clé
            ou élargis les filtres.
          </p>
          <Link
            href="/studio"
            className="inline-block rounded-lg bg-flex-accent px-5 py-2.5 text-xs font-bold text-white transition hover:brightness-110"
          >
            + Créer ce film toi-même
          </Link>
        </div>
      )}

      {hits && hits.length > 0 && (
        <>
          <div className="mb-3 text-xs uppercase tracking-widest text-flex-muted">
            {hits.length} résultat{hits.length > 1 ? "s" : ""}
          </div>
          <div className="relative">
            {/* Loading overlay between queries */}
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-flex-bg/60 backdrop-blur-sm">
                <LoadingPulse label="Mise à jour…" />
              </div>
            )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hits.map((h) => (
              <Link
                key={`${h.source}-${h.id}`}
                href={h.href}
                className="group overflow-hidden rounded-2xl border border-flex-border bg-flex-card shadow-cinema transition hover:border-flex-accent"
              >
                <div className="relative aspect-video w-full">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${h.coverUrl})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                        h.source === "community"
                          ? "bg-flex-accent/90 text-white"
                          : "bg-flex-accent2/90 text-white"
                      }`}
                    >
                      {h.source === "community" ? "Communauté" : "Démo"}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
                    {h.genre} · {h.durationMin} min
                    {h.year ? ` · ${h.year}` : ""}
                  </div>
                  <h3 className="mb-1 truncate text-lg font-bold">{highlight(h.title, q)}</h3>
                  <p className="mb-2 line-clamp-2 text-xs text-flex-muted">
                    {highlight(h.tagline, q)}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-flex-muted">
                    <span>par {h.author}</span>
                    {typeof h.likes === "number" && (
                      <span>♥ {h.likes}</span>
                    )}
                    {typeof h.rating === "number" && (
                      <span className="text-flex-gold">
                        ★ {h.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          </div>{/* close relative wrapper */}
        </>
      )}
    </div>
  );
}

/** Highlight matching substrings in search results. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query || !query.trim()) return text;
  const needle = query.trim();
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-flex-accent/20 text-inherit">
        {text.slice(idx, idx + needle.length)}
      </mark>
      {text.slice(idx + needle.length)}
    </>
  );
}
