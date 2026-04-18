"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogItem } from "@/lib/types";

const PREVIEW_DURATION = 20; // seconds
const HOVER_DELAY = 600; // ms before starting preview

/**
 * Film card with Netflix-style 20-second hover preview. When the user
 * hovers for 600ms and the item has a `previewUrl`, a muted video fades
 * in and plays for up to 20 seconds with a visible progress bar. Leaving
 * the card stops playback and reverts to the cover.
 */
export default function ContentCard({
  item,
  onHide,
}: {
  item: CatalogItem;
  onHide?: (id: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [progress, setProgress] = useState(0);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTimeRef = useRef(0);

  const stopPreview = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setShowPreview(false);
    setProgress(0);
  }, []);

  function handleMouseEnter() {
    if (!item.previewUrl) return;
    hoverTimerRef.current = setTimeout(() => {
      setShowPreview(true);
      startTimeRef.current = Date.now();
      // Start playback after React renders the <video>
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
        }
        // Progress ticker — updates every 100ms for smooth bar
        progressRef.current = setInterval(() => {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          const pct = Math.min(1, elapsed / PREVIEW_DURATION);
          setProgress(pct);
          if (pct >= 1) {
            // 20 seconds reached — stop
            stopPreview();
          }
        }, 100);
      }, 50);
    }, HOVER_DELAY);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPreview();
  }, [stopPreview]);

  return (
    <Link
      href={`/watch/${item.id}`}
      className="group block w-full focus:outline-none focus:ring-2 focus:ring-flex-accent rounded-[1.5rem]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={stopPreview}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-[1.5rem] shadow-obsidian bg-flex-card mb-4 transform transition-all duration-500 ease-out group-hover:-translate-y-2 group-hover:scale-[1.03] group-hover:shadow-glowSm animated-border">
        {/* Cover image — always rendered underneath */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
          style={{ backgroundImage: `url(${item.coverUrl})` }}
        />
        {/* Dark overlay for dark mode */}
        <div className="absolute inset-0 dark:bg-black/15 pointer-events-none transition" />

        {/* Preview video — fades in on hover, limited to 20s */}
        {item.previewUrl && showPreview && (
          <video
            ref={videoRef}
            src={item.previewUrl}
            className="absolute inset-0 h-full w-full object-cover animate-fadeIn"
            muted
            playsInline
          />
        )}

        {/* Progress bar — visible during preview */}
        {showPreview && (
          <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-black/30">
            <div
              className="h-full bg-flex-accent transition-[width] duration-100 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}

        {/* Muted indicator during preview */}
        {showPreview && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[9px] font-semibold text-white/80 backdrop-blur-md animate-fadeIn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            {Math.ceil(PREVIEW_DURATION - progress * PREVIEW_DURATION)}s
          </div>
        )}

        {/* Community badge */}
        {item.communityCreated && (
          <div className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-black shadow-sm backdrop-blur-md">
            IA
          </div>
        )}

        {/* Rating + hide button — visible on hover */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="rounded-full bg-black/40 border border-white/10 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-md flex items-center gap-1">
            <span className="text-flex-gold drop-shadow-md">★</span> {item.rating.toFixed(1)}
          </div>
          {onHide && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onHide(item.id);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-[10px] text-white backdrop-blur-md transition hover:bg-red-500/80"
              title="Pas intéressé"
              aria-label="Masquer ce film"
            >
              ✕
            </button>
          )}
        </div>

        {/* Play icon — visible during hover but before preview starts */}
        {!showPreview && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-500 group-hover:opacity-100 pointer-events-none">
            <div className="flex h-14 w-14 items-center justify-center rounded-full glass-panel bg-flex-accent/80 text-white pl-0.5 shadow-glow transition-transform duration-500 group-hover:scale-110">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5V19L19 12L8 5Z" />
              </svg>
            </div>
          </div>
        )}

        {/* Info overlay — slides up on hover */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 pb-4 pt-10 transition-transform duration-300 ease-out group-hover:translate-y-0">
          <p className="line-clamp-2 text-[11px] leading-relaxed text-white/80">
            {item.tagline}
          </p>
          {item.author && (
            <div className="mt-1.5 text-[10px] text-white/50">
              par {item.author}
            </div>
          )}
        </div>
      </div>

      <div className="px-1">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-flex-accent">
            {item.genre}
          </div>
          <div className="text-[11px] font-medium text-flex-muted">
            {item.durationMin} min
          </div>
        </div>
        <h3 className="font-display text-lg font-bold leading-tight text-flex-text transition-colors group-hover:text-flex-accent line-clamp-2">
          {item.title}
        </h3>
      </div>
    </Link>
  );
}
