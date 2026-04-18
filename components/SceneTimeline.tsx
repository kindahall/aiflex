"use client";

import Image from "next/image";
import { useRef } from "react";
import type { Scene } from "@/lib/types";

/**
 * Horizontal filmstrip timeline showing all scenes in order. Used in the
 * studio at the "scenes" stage, above the SceneGrid, to give creators a
 * bird's-eye view of their film structure.
 *
 * Each scene is a small thumbnail with status indicator. The strip is
 * horizontally scrollable via mouse drag and mouse wheel.
 */
export default function SceneTimeline({
  scenes,
  generatingIds,
  onScrollToScene,
}: {
  scenes: Scene[];
  generatingIds?: Set<string>;
  /** Called when the user clicks a scene tile — the parent can scroll
   *  the SceneGrid to that card. */
  onScrollToScene?: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Horizontal drag scrolling
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  function handleMouseDown(e: React.MouseEvent) {
    isDragging.current = true;
    startX.current = e.pageX - (scrollRef.current?.offsetLeft || 0);
    scrollLeft.current = scrollRef.current?.scrollLeft || 0;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  }

  function handleMouseUp() {
    isDragging.current = false;
  }

  // Horizontal wheel scrolling
  function handleWheel(e: React.WheelEvent) {
    if (scrollRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }

  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const videosReady = scenes.filter((s) => s.videoUrl).length;

  return (
    <div className="mb-6 rounded-2xl border border-flex-border bg-flex-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold uppercase tracking-widest text-flex-accent">
            Timeline
          </div>
          <div className="text-[10px] text-flex-muted">
            {scenes.length} scènes · {totalDuration}s ·{" "}
            {videosReady}/{scenes.length} vidéos
          </div>
        </div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-flex-border">
          <div
            className="h-full bg-flex-accent transition-all"
            style={{
              width: `${scenes.length ? (videosReady / scenes.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto hide-scrollbar cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {scenes.map((scene, i) => {
          const hasVideo = Boolean(scene.videoUrl);
          const generating = generatingIds?.has(scene.id);
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onScrollToScene?.(i)}
              className={`group relative shrink-0 overflow-hidden rounded-lg border transition-all hover:scale-105 hover:border-flex-accent ${
                hasVideo
                  ? "border-flex-accent/50"
                  : "border-flex-border"
              }`}
              style={{ width: `${Math.max(80, scene.durationSec * 12)}px` }}
              title={`#${i + 1} — ${scene.title}`}
            >
              <div className="relative aspect-video w-full bg-black">
                {scene.imageUrl && (
                  <Image
                    src={scene.imageUrl}
                    alt={scene.title}
                    fill
                    sizes="120px"
                    className="object-cover"
                    unoptimized
                  />
                )}
                {generating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-flex-accent border-t-transparent" />
                  </div>
                )}
                {/* Scene number */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[8px] font-bold text-white">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {hasVideo && (
                      <span className="h-1.5 w-1.5 rounded-full bg-flex-accent" />
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {/* End marker */}
        <div className="flex shrink-0 items-center justify-center rounded-lg border border-dashed border-flex-border px-4 text-[10px] font-bold uppercase tracking-widest text-flex-muted">
          FIN
        </div>
      </div>
    </div>
  );
}
