"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import { useAuth } from "@/lib/useAuth";
import { placeholderFor } from "@/lib/visuals";

interface WatchlistItem {
  id: string;
  title: string;
  logline: string;
  genre: string;
  format: string;
  coverUrl?: string;
  sceneCount: number;
  videoCount: number;
  publishedAt?: number;
  views: number;
  likes: number;
  author: string;
}

export default function WatchlistPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login?next=/watchlist");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/me/watchlist", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setItems(d.projects);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [user]);

  if (loading || !user || items === null) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-20">
        <LoadingPulse label="Chargement de ta liste" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Ma liste
      </div>
      <h1 className="mb-3 text-4xl font-black tracking-tight">
        À regarder plus tard
      </h1>
      <p className="mb-10 text-sm text-flex-muted">
        Les films que tu as sauvegardés depuis le feed AIflex.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          ⚠ {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-12 text-center">
          <div className="mb-3 text-5xl">🎬</div>
          <h3 className="mb-2 text-xl font-bold">Ta liste est vide</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-flex-muted">
            Explore le feed et clique sur ＋ Ma liste pour sauvegarder un
            film qui te tente.
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold text-white"
          >
            Explorer le feed
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const cover = p.coverUrl || placeholderFor(`feed-${p.id}`, 1280, 720);
            return (
              <Link
                key={p.id}
                href={`/watch/${p.id}`}
                className="group relative block aspect-video overflow-hidden rounded-lg bg-flex-card shadow-cinema"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-110"
                  style={{ backgroundImage: `url(${cover})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="text-sm font-bold">{p.title}</div>
                  <div className="text-[10px] text-flex-muted">
                    {p.genre} · {p.sceneCount} scènes · ♥ {p.likes}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
