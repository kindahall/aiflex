"use client";

import Link from "next/link";
import type { CatalogItem } from "@/lib/types";

export default function Hero({ item }: { item: CatalogItem }) {
  return (
      <div className="mx-auto flex h-full max-w-7xl flex-col justify-center px-6 lg:flex-row lg:items-center lg:gap-12 pt-20 pb-16">
        
        {/* Left Content Area */}
        <div className="relative z-10 w-full max-w-2xl animate-fadeUp lg:w-1/2 ambient-glow">
          <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-flex-accent/20 bg-flex-accent/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.3em] text-flex-accent backdrop-blur-md">
            <span className="h-2 w-2 animate-pulseGlow rounded-full bg-flex-accent shadow-glowSm" />
            Créé par la communauté IA
          </div>
          <h1 className="font-display mb-6 text-6xl font-black leading-[0.9] tracking-tighter text-flex-text sm:text-7xl lg:text-8xl drop-shadow-sm hologram-text">
            {item.title}
          </h1>
          <p className="font-display mb-6 text-2xl font-semibold text-gradient-accent">
            {item.tagline}
          </p>
          <p className="mb-8 max-w-xl text-base leading-relaxed text-flex-muted">
            {item.description}
          </p>
          <div className="mb-10 flex items-center gap-4 text-sm font-semibold text-flex-muted">
            <span className="flex items-center gap-1 rounded-md bg-white/10 backdrop-blur-md px-3 py-1.5 shadow-sm border border-white/5 text-flex-text">
              <span className="text-flex-gold drop-shadow-md">★</span> {item.rating.toFixed(1)}
            </span>
            <span className="rounded-md bg-flex-muted/10 backdrop-blur-sm border border-flex-border/50 px-3 py-1.5">{item.year}</span>
            <span className="rounded-md bg-flex-muted/10 backdrop-blur-sm border border-flex-border/50 px-3 py-1.5">{item.durationMin} min</span>
            <span className="uppercase tracking-wider opacity-80 text-flex-accent">{item.genre}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-8">
            <Link
              href={`/watch/${item.id}`}
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-flex-accent to-flex-accent2 px-8 py-4 text-sm font-bold uppercase tracking-widest text-white shadow-glow transition-all hover:scale-105 hover:shadow-glowSm inner-glow"
            >
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite_linear] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <span className="relative z-10 flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5V19L19 12L8 5Z" /></svg>
                Regarder l&apos;œuvre
              </span>
            </Link>
            <Link
              href="/studio"
              className="relative rounded-xl border border-white/10 glass-panel bg-flex-card/50 px-8 py-4 text-sm font-bold uppercase tracking-widest text-flex-text shadow-sm transition-all hover:bg-flex-muted/10 hover:border-flex-accent/50 hover:shadow-glowSm backdrop-blur-xl"
            >
              Créer le mien
            </Link>
          </div>
        </div>

        <div className="relative mt-12 w-full lg:mt-0 lg:w-1/2">
          <Link
            href={`/watch/${item.id}`}
            aria-label={`Regarder ${item.title}`}
            className="relative block aspect-video w-full overflow-hidden rounded-[2.5rem] bg-flex-card shadow-obsidian border border-white/10 transform transition-all duration-700 hover:scale-[1.03] hover:shadow-glowSm animated-border group"
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-110"
              style={{ backgroundImage: `url(${item.backdropUrl})` }}
            />
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-all duration-500 group-hover:bg-black/40 backdrop-blur-[2px] group-hover:backdrop-blur-sm">
              <div className="flex h-20 w-20 items-center justify-center rounded-full glass-panel bg-white/10 shadow-glass text-white pl-1 backdrop-blur-xl transition-all duration-500 group-hover:scale-110 group-hover:bg-flex-accent group-hover:shadow-glow">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 5V19L19 12L8 5Z" />
                </svg>
              </div>
            </div>
          </Link>
          {/* Decorative elements behind image */}
          <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-tr from-flex-accent/30 to-flex-accent2/30 blur-3xl opacity-70 animate-blob"></div>
        </div>
        
      </div>
  );
}
