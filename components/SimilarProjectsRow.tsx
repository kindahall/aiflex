"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { placeholderFor } from "@/lib/visuals";

interface SimilarItem {
  id: string;
  title: string;
  coverUrl?: string;
  sceneCount: number;
  views: number;
  likes: number;
  genre: string;
  author: string;
}

/**
 * "Films similaires" section powered by the recommendation algorithm.
 * Fetches from /api/projects/[id]/similar. Falls back to nothing if
 * the API returns no results.
 */
export default function SimilarProjectsRow({
  projectId,
}: {
  projectId: string;
}) {
  const [items, setItems] = useState<SimilarItem[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/similar?limit=6`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.projects) setItems(data.projects);
      })
      .catch(() => setItems([]));
  }, [projectId]);

  if (items.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-4 text-2xl font-black">Films similaires</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => {
          const cover =
            p.coverUrl || placeholderFor(`feed-${p.id}`, 1280, 720);
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
                  {p.sceneCount} scenes &middot; {p.genre}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
