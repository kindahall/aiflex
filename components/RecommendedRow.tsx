"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import ContentRow from "./ContentRow";
import type { CatalogItem } from "@/lib/types";
import { placeholderFor } from "@/lib/visuals";
import type { PublicFeedItem } from "@/lib/client-api";

/**
 * "Recommande pour vous" row that appears on the home page for
 * authenticated users. Fetches personalized recommendations from
 * the /api/feed/recommended endpoint.
 */
export default function RecommendedRow() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);

  useEffect(() => {
    if (loading || !user) return;
    fetch("/api/feed/recommended?limit=20", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.projects) {
          setItems(data.projects.map(feedToCatalog));
        }
      })
      .catch(() => setItems([]));
  }, [user, loading]);

  if (!user || items.length === 0) return null;

  return (
    <ContentRow
      title="Recommande pour vous"
      subtitle="Films selectionnes en fonction de vos gouts"
      items={items}
    />
  );
}

function feedToCatalog(item: PublicFeedItem): CatalogItem {
  const ratingProxy = Math.min(
    9.9,
    5 + item.videoCount * 0.2 + Math.log10(1 + item.views) * 0.5
  );
  return {
    id: item.id,
    title: item.title,
    genre: item.genre as CatalogItem["genre"],
    tagline: item.logline,
    description: item.synopsis,
    coverUrl: item.coverUrl || placeholderFor(`feed-${item.id}`, 1280, 720),
    backdropUrl:
      item.backdropUrl || placeholderFor(`feed-bd-${item.id}`, 1920, 1080),
    durationMin: Math.max(1, Math.round((item.sceneCount * 8) / 60)),
    year: new Date(item.publishedAt || Date.now()).getFullYear(),
    rating: Number(ratingProxy.toFixed(1)),
    author: item.author,
    communityCreated: true,
    previewUrl: item.previewUrl || undefined,
  };
}
