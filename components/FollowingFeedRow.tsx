"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import ContentRow from "./ContentRow";
import type { CatalogItem } from "@/lib/types";
import type { PublicFeedItem } from "@/lib/client-api";
import { placeholderFor } from "@/lib/visuals";

/**
 * Displays a "Mes abonnements" row on the home page with projects
 * from users the current user follows. Only renders when logged in
 * and when there are projects to show.
 */
export default function FollowingFeedRow() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);

  useEffect(() => {
    if (loading || !user) return;
    fetch("/api/feed/following", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then((d) => {
        const mapped = (d.projects as PublicFeedItem[]).map(feedToCatalog);
        setItems(mapped);
      })
      .catch(() => setItems([]));
  }, [user, loading]);

  if (!user || items.length === 0) return null;

  return (
    <ContentRow
      title="Mes abonnements"
      subtitle="Les derniers films des cr\u00e9ateurs que tu suis"
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
