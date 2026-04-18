"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import Hero from "@/components/Hero";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import FollowingFeedRow from "@/components/FollowingFeedRow";
import ContentRow from "@/components/ContentRow";
import RecommendedRow from "@/components/RecommendedRow";
import { CATALOG, byGenre, communityPicks, trending } from "@/lib/catalog";
import { fetchPublicFeed, type PublicFeedItem } from "@/lib/client-api";
import type { CatalogItem } from "@/lib/types";
import { placeholderFor } from "@/lib/visuals";

// Hero fallback used when the demo catalog is disabled (production) and no
// featured project has been selected yet by the admin. Keeps the page
// prerender-safe without pulling in a large demo array.
const HERO_PLACEHOLDER: CatalogItem = {
  id: "hero-placeholder",
  title: "Bienvenue sur AIflex",
  genre: "drama",
  tagline: "Streame. Crée. Deviens réalisateur.",
  description:
    "La première plateforme où chaque spectateur peut devenir créateur.",
  coverUrl: placeholderFor("hero-placeholder-cover", 1280, 720),
  backdropUrl: placeholderFor("hero-placeholder-bd", 1920, 1080),
  durationMin: 0,
  year: new Date().getFullYear(),
  rating: 9.5,
  author: "AIflex",
};

export default function HomePage() {
  const { t } = useTranslation();
  const catalogFallback = CATALOG[0] || HERO_PLACEHOLDER;
  const [featured, setFeatured] = useState<CatalogItem>(catalogFallback);
  const [userFilms, setUserFilms] = useState<CatalogItem[]>([]);

  useEffect(() => {
    // Fetch the admin-selected featured film
    fetch("/api/site-content")
      .then((r) => r.json())
      .then((d) => {
        if (d.featuredProjectId) {
          // Load the featured project
          fetch(`/api/feed/${d.featuredProjectId}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.project && !data.error) {
                const p = data.project;
                setFeatured({
                  id: p.id,
                  title: p.concept?.title || "Film en affiche",
                  genre: p.genre as CatalogItem["genre"],
                  tagline: p.concept?.logline || "",
                  description: p.concept?.synopsis || "",
                  coverUrl: p.scenes?.[0]?.imageUrl || placeholderFor(`feat-${p.id}`, 1280, 720),
                  backdropUrl: p.scenes?.[0]?.imageUrl || placeholderFor(`feat-bd-${p.id}`, 1920, 1080),
                  durationMin: Math.max(1, Math.round(((p.scenes?.length || 1) * 8) / 60)),
                  year: new Date(p.publishedAt || Date.now()).getFullYear(),
                  rating: Math.min(9.9, 5 + Math.log10(1 + (p.views || 0)) * 0.5),
                  author: p.author || "Créateur AIflex",
                  communityCreated: true,
                  previewUrl: p.scenes?.[0]?.videoUrl || undefined,
                });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    fetchPublicFeed()
      .then((items) => setUserFilms(items.map(feedToCatalog)))
      .catch(() => setUserFilms([]));
  }, []);

  return (
    <div>
      <Hero item={featured} />

      <ContinueWatchingRow />

      <FollowingFeedRow />

      <RecommendedRow />

      {userFilms.length > 0 && (
        <ContentRow
          title={`✦ ${t("home.communityFilms")}`}
          subtitle={t("home.communitySubtitle")}
          items={userFilms}
        />
      )}
      <ContentRow
        title={t("home.trending")}
        subtitle={t("home.trendingSubtitle")}
        items={trending()}
      />
      <ContentRow
        title={t("home.demos")}
        subtitle={t("home.demosSubtitle")}
        items={communityPicks()}
      />
      <ContentRow
        title={t("home.scifi")}
        subtitle={t("home.scifiSubtitle")}
        items={byGenre("sci-fi").concat(byGenre("anime"))}
      />
      <ContentRow
        title={t("home.drama")}
        items={byGenre("drama").concat(byGenre("romance"))}
      />
      <ContentRow
        title={t("home.thrills")}
        items={byGenre("thriller")
          .concat(byGenre("horror"))
          .concat(byGenre("action"))
          .concat(byGenre("noir"))}
      />

      <div className="relative mx-auto mt-32 mb-40 max-w-5xl px-6 text-center">
        {/* Animated Background Blobs */}
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-40">
          <div className="absolute h-96 w-96 animate-blob rounded-full bg-flex-accent mix-blend-overlay filter blur-[100px]" />
          <div className="absolute h-96 w-96 animate-blob rounded-full bg-flex-accent2 mix-blend-overlay filter blur-[100px]" style={{ animationDelay: "2s" }} />
        </div>

        <div className="relative z-10 flex flex-col items-center overflow-hidden rounded-[3rem] border border-white/5 glass-panel bg-flex-panel/40 p-12 shadow-obsidian backdrop-blur-3xl md:p-20 animated-border">
          <div className="mb-6 inline-flex animate-pulseGlow items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.3em] text-flex-accent shadow-glowSm backdrop-blur-md">
            <span className="h-2 w-2 animate-pulseGlow rounded-full bg-flex-accent shadow-sm" />
            {t("home.ctaBadge")}
          </div>
          <h2 className="font-display mb-6 text-4xl font-black tracking-tight text-flex-text md:text-6xl drop-shadow-sm hologram-text">
            {t("home.ctaTitle")}
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-flex-muted md:text-xl">
            {t("home.ctaDescription")}
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Link
              href="/studio"
              className="group relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-flex-accent to-flex-accent2 px-12 py-5 text-base font-bold uppercase tracking-widest text-white shadow-glow transition-all hover:scale-105 hover:shadow-glowSm inner-glow"
            >
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite_linear] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <span className="relative z-10">{t("home.ctaPrimary")}</span>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 glass-panel bg-flex-card/50 px-10 py-5 text-base font-bold uppercase tracking-widest text-flex-text shadow-sm transition-all hover:bg-flex-muted/10 hover:border-flex-accent/50 hover:shadow-glowSm"
            >
              {t("home.ctaSecondary")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Adapt a public feed item into the shape expected by ContentRow/ContentCard. */
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
