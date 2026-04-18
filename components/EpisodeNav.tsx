"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

interface Episode {
  id: string;
  title: string;
  episodeNumber: number;
  stage: string;
  published: boolean;
  sceneCount: number;
}

interface SeriesData {
  seriesId: string;
  seriesTitle: string;
  episodes: Episode[];
}

/**
 * Episode navigation bar shown on /watch/[id] when the film is part of a
 * series. Displays the series title + a horizontal list of episode pills,
 * with the current episode highlighted.
 *
 * Only shows published episodes to anonymous viewers; in the studio all
 * are shown regardless.
 */
export default function EpisodeNav({
  projectId,
  publicOnly,
}: {
  projectId: string;
  publicOnly?: boolean;
}) {
  const [data, setData] = useState<SeriesData | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/projects/${projectId}/series`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.episodes?.length > 1) setData(d);
      })
      .catch(() => toast("error", "Impossible de charger les épisodes"));
  }, [projectId]);

  if (!data) return null;

  const episodes = publicOnly
    ? data.episodes.filter((e) => e.published)
    : data.episodes;

  if (episodes.length <= 1) return null;

  return (
    <div className="mb-6 rounded-2xl border border-flex-border bg-flex-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-xs font-bold uppercase tracking-widest text-flex-accent2">
          Série
        </div>
        <div className="text-sm font-bold text-flex-text">
          {data.seriesTitle}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto hide-scrollbar">
        {episodes.map((ep) => {
          const isCurrent = ep.id === projectId;
          return (
            <Link
              key={ep.id}
              href={`/watch/${ep.id}`}
              className={`shrink-0 rounded-lg border px-4 py-2 text-xs font-semibold transition ${
                isCurrent
                  ? "border-flex-accent bg-flex-accent/10 text-flex-accent"
                  : "border-flex-border bg-flex-card text-flex-text hover:border-flex-accent"
              }`}
            >
              <span className="font-mono">
                E{String(ep.episodeNumber || 0).padStart(2, "0")}
              </span>
              <span className="ml-2 hidden sm:inline">{ep.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
