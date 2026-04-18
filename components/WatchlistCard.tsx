"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface WatchItem {
  id: string;
  title: string;
  coverUrl?: string;
  genre: string;
  author: string;
}

const MAX = 4;

/**
 * Dashboard preview of the user's watchlist — 4 most recent posters with
 * a link to the full /watchlist route.
 */
export default function WatchlistCard() {
  const [items, setItems] = useState<WatchItem[] | null>(null);

  useEffect(() => {
    fetch("/api/me/watchlist", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems((d.projects || []).slice(0, MAX)))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5 shadow-cinema">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
            Ma liste
          </div>
          <h3 className="text-base font-bold">Watchlist</h3>
        </div>
        <Link
          href="/watchlist"
          className="shrink-0 rounded-lg bg-flex-panel px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-flex-text transition hover:bg-flex-border"
        >
          Tout voir →
        </Link>
      </div>
      {items === null ? (
        <div className="text-xs text-flex-muted">Chargement…</div>
      ) : items.length === 0 ? (
        <p className="text-xs text-flex-muted">
          Rien dans ta watchlist. Ajoute des films depuis la page d'un projet.
        </p>
      ) : (
        <ul className="grid grid-cols-4 gap-2">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/watch/${p.id}`}
                className="block"
                title={p.title}
              >
                <div
                  className="aspect-[2/3] rounded-lg bg-cover bg-center shadow-inner ring-1 ring-flex-border transition hover:ring-flex-accent/60"
                  style={{
                    backgroundImage: `url(${
                      p.coverUrl ||
                      `https://picsum.photos/seed/${p.id}/240/360`
                    })`,
                  }}
                />
                <div className="mt-1 truncate text-[10px] font-semibold">
                  {p.title}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
