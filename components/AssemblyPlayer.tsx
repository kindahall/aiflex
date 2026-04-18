"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Scene, SubtitleEntry } from "@/lib/types";
import SubtitleOverlay from "./SubtitleOverlay";

/**
 * Minimal sequential player that chains scene videos (or still images with
 * a timer fallback) to preview the final assembled film.
 */
export default function AssemblyPlayer({
  scenes,
  title,
  onProgressChange,
}: {
  scenes: Scene[];
  title: string;
  /** Called whenever the current scene changes so the parent can persist
   *  viewing progress. Args: (sceneIndex, progress 0..1). */
  onProgressChange?: (sceneIndex: number, progress: number) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [quality, setQuality] = useState<"auto" | "1080p" | "720p" | "480p">("auto");
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const readyScenes = useMemo(
    () => scenes.filter((s) => s.videoUrl || s.imageUrl),
    [scenes]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Track video currentTime for subtitle sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    function onTimeUpdate() {
      setCurrentTimeSec(video!.currentTime);
    }
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [current]); // re-bind when scene changes

  // Compute subtitles for the current scene (relative to scene start)
  const currentSubtitles: SubtitleEntry[] = useMemo(() => {
    const scene = readyScenes[current];
    return scene?.subtitles || [];
  }, [readyScenes, current]);

  // Fullscreen state sync
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  }

  // Keyboard shortcuts: Space = play/pause, Left/Right = prev/next scene,
  // F = fullscreen. Only active when the player is visible (mounted).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't capture if the user is typing in an input/textarea.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ": {
          e.preventDefault();
          if (playing) {
            setPlaying(false);
            videoRef.current?.pause();
          } else {
            setCurrent(0);
            setPlaying(true);
          }
          break;
        }
        case "ArrowRight":
          e.preventDefault();
          advance();
          break;
        case "ArrowLeft":
          e.preventDefault();
          setCurrent((c) => Math.max(0, c - 1));
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "c":
        case "C":
          e.preventDefault();
          setSubtitlesEnabled((v) => !v);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, readyScenes.length]);

  useEffect(() => {
    if (!playing) return;
    const scene = readyScenes[current];
    if (!scene) {
      setPlaying(false);
      return;
    }
    if (scene.videoUrl && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play();
    } else {
      // Still image fallback — hold for durationSec
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => advance(),
        (scene.durationSec || 6) * 1000
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, playing]);

  function advance() {
    setCurrent((c) => {
      if (c + 1 >= readyScenes.length) {
        setPlaying(false);
        onProgressChange?.(c, 1); // finished
        return 0;
      }
      const next = c + 1;
      onProgressChange?.(next, (next + 1) / readyScenes.length);
      return next;
    });
  }

  const scene = readyScenes[current];
  if (!scene) {
    return (
      <div className="rounded-2xl border border-flex-border bg-flex-card p-10 text-center text-flex-muted">
        Aucune scène prête à assembler.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-hidden rounded-2xl border border-flex-border bg-black shadow-cinema">
      <div className="relative aspect-video w-full bg-black">
        {scene.videoUrl ? (
          <video
            key={scene.id}
            ref={videoRef}
            src={scene.videoUrl}
            className="h-full w-full object-cover"
            playsInline
            onEnded={advance}
            controls={!playing}
          />
        ) : scene.imageUrl ? (
          <Image
            src={scene.imageUrl}
            alt={scene.title}
            fill
            sizes="(min-width:1024px) 80vw, 100vw"
            className="object-cover"
            unoptimized
            priority
          />
        ) : null}
        {/* Subtitle overlay */}
        <SubtitleOverlay
          subtitles={currentSubtitles}
          currentTimeSec={currentTimeSec}
          enabled={subtitlesEnabled}
        />
        {/* AI-generated content disclosure — required by EU AI Act for any
            synthetic media. Always visible, never dismissable. */}
        <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-flex-bg/85 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-flex-accent shadow-md backdrop-blur-md">
          ✦ Généré par IA · AIflex
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-6">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-accent">
            {title} — scène {current + 1} / {readyScenes.length}
          </div>
          <div className="text-xl font-bold text-white">{scene.title}</div>
          <div className="text-xs text-flex-muted">
            {scene.location} · {scene.timeOfDay}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-flex-border bg-flex-panel px-6 py-3">
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          className="rounded-lg bg-flex-card px-4 py-2 text-xs font-semibold text-flex-text transition hover:bg-flex-border"
        >
          ← Précédente
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrent(0);
            setPlaying(true);
          }}
          className="rounded-lg bg-flex-accent px-6 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110"
        >
          ▶ Lecture complète
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={advance}
            className="rounded-lg bg-flex-card px-4 py-2 text-xs font-semibold text-flex-text transition hover:bg-flex-border"
          >
            Suivante →
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-flex-card text-xs font-bold text-flex-muted transition hover:bg-flex-border hover:text-flex-text"
            aria-label="Raccourcis clavier"
            title="Raccourcis clavier (?)"
          >
            ?
          </button>
          <button
            type="button"
            onClick={() => setSubtitlesEnabled((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition ${
              subtitlesEnabled
                ? "bg-flex-accent text-white"
                : "bg-flex-card text-flex-text hover:bg-flex-border"
            }`}
            aria-label={subtitlesEnabled ? "Désactiver les sous-titres" : "Activer les sous-titres"}
            title={subtitlesEnabled ? "Sous-titres activés (C)" : "Sous-titres désactivés (C)"}
          >
            CC
          </button>
          {/* Quality selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowQualityMenu((v) => !v)}
              className="flex h-8 items-center gap-1 rounded-lg bg-flex-card px-2 text-[10px] font-bold text-flex-text transition hover:bg-flex-border"
              aria-label="Qualité vidéo"
              title="Qualité vidéo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              {quality === "auto" ? "Auto" : quality}
            </button>
            {showQualityMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-32 rounded-xl bg-flex-card border border-flex-border shadow-xl overflow-hidden z-50">
                {(["auto", "1080p", "720p", "480p"] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { setQuality(q); setShowQualityMenu(false); }}
                    className={`block w-full px-4 py-2 text-left text-xs font-medium transition ${
                      quality === q
                        ? "bg-flex-accent text-white"
                        : "text-flex-text hover:bg-flex-surface"
                    }`}
                  >
                    {q === "auto" ? "Auto (recommandé)" : q}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-flex-card text-flex-text transition hover:bg-flex-border"
            aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
            title={isFullscreen ? "Quitter le plein écran (F)" : "Plein écran (F)"}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
