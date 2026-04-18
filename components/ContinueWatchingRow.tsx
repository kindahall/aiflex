"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";
import { placeholderFor } from "@/lib/visuals";

interface ProgressItem {
  projectId: string;
  lastSceneIndex: number;
  progress: number;
  title: string;
  genre: string;
  coverUrl?: string;
  sceneCount: number;
  author: string;
}

/**
 * "Reprendre la lecture" row on the home page. Only visible for logged-in
 * users who have in-progress films (progress > 0 and < 1). Fetches from
 * /api/me/progress on mount.
 */
export default function ContinueWatchingRow() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<ProgressItem[]>([]);

  useEffect(() => {
    if (loading || !user) return;
    fetch("/api/me/progress", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => toast("error", "Impossible de charger tes films en cours"));
  }, [user, loading, toast]);

  if (!user || items.length === 0) return null;

  return (
    <section className="my-10">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-4">
          <h2 className="font-display text-2xl font-black tracking-tight">
            Reprendre la lecture
          </h2>
          <p className="mt-0.5 text-sm text-flex-muted">
            Tes films en cours — là où tu t&apos;es arrêté
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const cover =
              item.coverUrl ||
              placeholderFor(`feed-${item.projectId}`, 1280, 720);
            const pct = Math.round(item.progress * 100);
            return (
              <Link
                key={item.projectId}
                href={`/watch/${item.projectId}`}
                className="group relative overflow-hidden rounded-2xl border border-flex-border bg-flex-card shadow-cinema transition hover:border-flex-accent"
              >
                <div className="relative aspect-video w-full">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${cover})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  {/* Progress bar */}
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-flex-border/50">
                    <div
                      className="h-full bg-flex-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-flex-bg/90 pl-1 text-flex-text shadow-glass backdrop-blur-md">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5V19L19 12L8 5Z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-flex-accent">
                      {item.genre}
                    </div>
                    <div className="text-[10px] text-flex-muted">
                      {pct}% · scène {item.lastSceneIndex + 1}/
                      {item.sceneCount}
                    </div>
                  </div>
                  <h3 className="truncate text-base font-bold transition group-hover:text-flex-accent">
                    {item.title}
                  </h3>
                  <div className="mt-0.5 text-[10px] text-flex-muted">
                    par {item.author}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
