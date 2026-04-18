"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Scene } from "@/lib/types";
import {
  TRANSITION_OPTIONS,
  TransitionOverlay,
  TransitionStyles,
  type TransitionType,
} from "./TransitionEffects";

// ─── Types ──────────────────────────────────────────────────────────────

interface TextOverlay {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  startSec: number;
  endSec: number;
}

interface HistoryEntry {
  scenes: Scene[];
}

interface Props {
  scenes: Scene[];
  title: string;
  audioTrackUrl?: string;
  onChange: (scenes: Scene[]) => void;
  onExport?: (format: "original" | "compressed") => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function getEffectiveDuration(s: Scene) {
  const start = s.trimStart ?? 0;
  const end = s.trimEnd ?? s.durationSec;
  return Math.max(0.1, end - start);
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Component ──────────────────────────────────────────────────────────

export default function VideoEditor({
  scenes: initialScenes,
  title,
  audioTrackUrl,
  onChange,
  onExport,
}: Props) {
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [masterVolume, setMasterVolume] = useState(80);
  const [voiceoverVolume, setVoiceoverVolume] = useState(100);

  // History for undo
  const [history, setHistory] = useState<HistoryEntry[]>([{ scenes: initialScenes }]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent when prop changes (e.g. after server save)
  useEffect(() => {
    setScenes(initialScenes);
  }, [initialScenes]);

  const selected = useMemo(
    () => scenes.find((s) => s.id === selectedId) ?? null,
    [scenes, selectedId]
  );

  const totalDuration = useMemo(
    () => scenes.reduce((sum, s) => sum + getEffectiveDuration(s), 0),
    [scenes]
  );

  // ── Scene mutation helper ─────────────────────────────────────────────

  const commitScenes = useCallback(
    (next: Scene[]) => {
      setScenes(next);
      // Push to history, truncating redo branch
      setHistory((h) => {
        const trimmed = h.slice(0, historyIdx + 1);
        return [...trimmed, { scenes: next }];
      });
      setHistoryIdx((i) => i + 1);
      onChange(next);
    },
    [historyIdx, onChange]
  );

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<Scene>) => {
      commitScenes(
        scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s))
      );
    },
    [scenes, commitScenes]
  );

  // ── Undo ──────────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prev = historyIdx - 1;
    setHistoryIdx(prev);
    const restored = history[prev].scenes;
    setScenes(restored);
    onChange(restored);
  }, [historyIdx, history, onChange]);

  // ── Playback ──────────────────────────────────────────────────────────

  const [transitionActive, setTransitionActive] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const scene = scenes[currentIdx];
    if (!scene) {
      setPlaying(false);
      return;
    }
    if (scene.videoUrl && videoRef.current) {
      const vid = videoRef.current;
      vid.currentTime = scene.trimStart ?? 0;
      vid.volume = ((scene.audioVolume ?? 1) * masterVolume) / 100;
      void vid.play();
    } else {
      // Still image fallback
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        advancePlayback();
      }, getEffectiveDuration(scene) * 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, playing]);

  function advancePlayback() {
    if (currentIdx + 1 >= scenes.length) {
      setPlaying(false);
      setCurrentIdx(0);
      return;
    }
    const nextScene = scenes[currentIdx + 1];
    const transition = nextScene?.transitionIn ?? "cut";
    if (transition !== "cut") {
      setTransitionActive(true);
    } else {
      setCurrentIdx((c) => c + 1);
    }
  }

  function handleTransitionComplete() {
    setTransitionActive(false);
    setCurrentIdx((c) => c + 1);
  }

  // Video timeupdate — enforce trimEnd
  function handleTimeUpdate() {
    if (!videoRef.current) return;
    const scene = scenes[currentIdx];
    if (!scene) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    const trimEnd = scene.trimEnd ?? scene.durationSec;
    if (t >= trimEnd) {
      videoRef.current.pause();
      advancePlayback();
    }
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      videoRef.current?.pause();
    } else {
      setPlaying(true);
    }
  }

  // ── Drag & Drop reorder ───────────────────────────────────────────────

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...scenes];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    commitScenes(next.map((s, i) => ({ ...s, index: i })));
    setDragIdx(null);
    setDragOverIdx(null);
  }

  // ── Scene operations ──────────────────────────────────────────────────

  function duplicateScene(sceneId: string) {
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const source = scenes[idx];
    const dup: Scene = {
      ...source,
      id: `s_${Date.now()}_dup`,
      title: `${source.title} (copie)`,
    };
    const next = [...scenes];
    next.splice(idx + 1, 0, dup);
    commitScenes(next.map((s, i) => ({ ...s, index: i })));
  }

  function deleteScene(sceneId: string) {
    commitScenes(
      scenes.filter((s) => s.id !== sceneId).map((s, i) => ({ ...s, index: i }))
    );
    if (selectedId === sceneId) setSelectedId(null);
  }

  function splitScene(sceneId: string, atSec: number) {
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const original = scenes[idx];
    const trimStart = original.trimStart ?? 0;
    const trimEnd = original.trimEnd ?? original.durationSec;
    if (atSec <= trimStart || atSec >= trimEnd) return;

    const partA: Scene = {
      ...original,
      id: `${original.id}_a`,
      title: `${original.title} (A)`,
      trimEnd: atSec,
    };
    const partB: Scene = {
      ...original,
      id: `${original.id}_b`,
      title: `${original.title} (B)`,
      trimStart: atSec,
    };
    const next = [...scenes];
    next.splice(idx, 1, partA, partB);
    commitScenes(next.map((s, i) => ({ ...s, index: i })));
  }

  // ── Text overlay management ───────────────────────────────────────────

  function addTextOverlay(sceneId: string) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const overlay: TextOverlay = {
      text: "Texte",
      x: 50,
      y: 50,
      fontSize: 24,
      color: "#ffffff",
      startSec: scene.trimStart ?? 0,
      endSec: scene.trimEnd ?? scene.durationSec,
    };
    updateScene(sceneId, {
      textOverlays: [...(scene.textOverlays ?? []), overlay],
    });
  }

  function updateTextOverlay(
    sceneId: string,
    overlayIdx: number,
    patch: Partial<TextOverlay>
  ) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const overlays = [...(scene.textOverlays ?? [])];
    overlays[overlayIdx] = { ...overlays[overlayIdx], ...patch };
    updateScene(sceneId, { textOverlays: overlays });
  }

  function removeTextOverlay(sceneId: string, overlayIdx: number) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const overlays = [...(scene.textOverlays ?? [])];
    overlays.splice(overlayIdx, 1);
    updateScene(sceneId, { textOverlays: overlays });
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "[":
          if (selected) {
            e.preventDefault();
            updateScene(selected.id, { trimStart: currentTime });
          }
          break;
        case "]":
          if (selected) {
            e.preventDefault();
            updateScene(selected.id, { trimEnd: currentTime });
          }
          break;
        case "Delete":
        case "Backspace":
          if (selected && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            deleteScene(selected.id);
          }
          break;
        case "d":
          if ((e.ctrlKey || e.metaKey) && selected) {
            e.preventDefault();
            duplicateScene(selected.id);
          }
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            undo();
          }
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, currentTime, playing]);

  // ── Render ────────────────────────────────────────────────────────────

  const currentScene = scenes[currentIdx];

  return (
    <div className="flex h-full flex-col bg-[var(--flex-bg)]/80 backdrop-blur-3xl text-[var(--flex-text)] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-flex-accent/5 to-flex-accent2/5 pointer-events-none" />
      <TransitionStyles />

      {/* ═══ TOP TOOLBAR ═══ */}
      <div className="relative z-10 flex items-center justify-between border-b border-[var(--flex-border)] glass-panel px-4 py-3 shadow-obsidian">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--flex-accent)]">
            Editeur
          </span>
          <span className="text-sm font-semibold truncate max-w-[200px]">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={historyIdx <= 0}
            className="rounded-md border border-white/5 bg-[var(--flex-card)]/50 px-3 py-1.5 text-[11px] font-semibold transition hover:border-[var(--flex-accent)]/50 disabled:opacity-30 backdrop-blur-sm"
            title="Annuler (Ctrl+Z)"
          >
            Annuler
          </button>
          {onExport && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onExport("original")}
                className="rounded-md bg-[var(--flex-accent)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              >
                Exporter le film
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MAIN AREA ═══ */}
      <div className="flex min-h-0 flex-1">
        {/* ── LEFT: Scene List (compact) ─────────────────────────── */}
        <div className="z-10 w-48 shrink-0 overflow-y-auto border-r border-[var(--flex-border)] glass-panel backdrop-blur-2xl">
          <div className="p-2 text-[10px] font-bold uppercase tracking-widest text-[var(--flex-muted)]">
            Scenes ({scenes.length})
          </div>
          <div className="space-y-0.5 px-1 pb-2">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedId(s.id);
                  setCurrentIdx(i);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition ${
                  selectedId === s.id
                    ? "bg-[var(--flex-accent)]/20 text-[var(--flex-accent)]"
                    : "hover:bg-[var(--flex-card)]"
                }`}
              >
                <span className="shrink-0 font-mono text-[10px] text-[var(--flex-muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="truncate font-medium">{s.title}</span>
                <span className="ml-auto shrink-0 text-[10px] text-[var(--flex-muted)]">
                  {formatTime(getEffectiveDuration(s))}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── CENTER: Preview + Timeline ─────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Preview area */}
          <div className="relative flex flex-1 items-center justify-center bg-black">
            {currentScene?.videoUrl ? (
              <video
                key={currentScene.id}
                ref={videoRef}
                src={currentScene.videoUrl}
                className="max-h-full max-w-full object-contain"
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => advancePlayback()}
              />
            ) : currentScene?.imageUrl ? (
              <div className="relative h-full w-full">
                <Image
                  src={currentScene.imageUrl}
                  alt={currentScene.title}
                  fill
                  sizes="60vw"
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="text-sm text-[var(--flex-muted)]">
                Aucun media
              </div>
            )}

            {/* Text overlays */}
            {currentScene?.textOverlays?.map((overlay, oi) => {
              const t = currentTime;
              if (t < overlay.startSec || t > overlay.endSec) return null;
              return (
                <div
                  key={oi}
                  className="pointer-events-none absolute"
                  style={{
                    left: `${overlay.x}%`,
                    top: `${overlay.y}%`,
                    transform: "translate(-50%, -50%)",
                    fontSize: overlay.fontSize,
                    color: overlay.color,
                    fontWeight: "bold",
                    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  }}
                >
                  {overlay.text}
                </div>
              );
            })}

            {/* Transition overlay */}
            <TransitionOverlay
              type={(scenes[currentIdx + 1]?.transitionIn as TransitionType) ?? "cut"}
              active={transitionActive}
              onComplete={handleTransitionComplete}
            />

            {/* Play button overlay */}
            {!playing && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/30 transition hover:bg-black/40 backdrop-blur-sm"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-[var(--flex-accent)] to-[var(--flex-accent2)] text-white shadow-glow hover:scale-110 transition-transform duration-300">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </button>
            )}

            {/* Scene info */}
            <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] text-white backdrop-blur">
              Scene {currentIdx + 1}/{scenes.length} - {currentScene?.title}
            </div>
          </div>

          {/* Playback controls */}
          <div className="z-10 flex items-center gap-3 border-y border-[var(--flex-border)] glass-panel px-4 py-3">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--flex-accent)] text-white"
              title="Lecture/Pause (Espace)"
            >
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <span className="font-mono text-xs text-[var(--flex-muted)]">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
            <div className="flex-1" />
            <span className="text-[10px] text-[var(--flex-muted)]">
              {scenes.length} scenes - {formatTime(totalDuration)} total
            </span>
          </div>

          {/* ── Timeline ─────────────────────────────────────────── */}
          <div
            ref={timelineRef}
            className="z-10 flex items-end gap-0 overflow-x-auto border-b border-[var(--flex-border)] bg-[var(--flex-bg)]/50 backdrop-blur-md p-3"
            style={{ minHeight: 80 }}
          >
            {scenes.map((s, i) => {
              const dur = getEffectiveDuration(s);
              const minW = 60;
              const w = Math.max(minW, dur * 16);
              const isSelected = s.id === selectedId;
              const isDragOver = dragOverIdx === i;

              return (
                <div key={s.id} className="flex items-end">
                  {/* Transition zone between clips */}
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(s.id);
                        // Cycle through transitions
                        const opts: TransitionType[] = ["cut", "fade", "dissolve", "wipe-left", "wipe-right"];
                        const cur = s.transitionIn ?? "cut";
                        const nextT = opts[(opts.indexOf(cur) + 1) % opts.length];
                        updateScene(s.id, { transitionIn: nextT });
                      }}
                      className="mx-0.5 flex h-12 w-6 shrink-0 flex-col items-center justify-center rounded bg-[var(--flex-card)] text-[8px] text-[var(--flex-muted)] transition hover:bg-[var(--flex-accent)]/20"
                      title={`Transition: ${s.transitionIn ?? "cut"} (cliquer pour changer)`}
                    >
                      <TransitionIcon type={s.transitionIn ?? "cut"} />
                      <span className="mt-0.5 leading-none">
                        {(s.transitionIn ?? "cut").slice(0, 3)}
                      </span>
                    </button>
                  )}

                  {/* Scene clip */}
                  <div
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    onClick={() => {
                      setSelectedId(s.id);
                      setCurrentIdx(i);
                    }}
                    className={`relative shrink-0 cursor-pointer overflow-hidden rounded-md border-2 transition ${
                      isSelected
                        ? "border-[var(--flex-accent)] shadow-md"
                        : isDragOver
                        ? "border-[var(--flex-accent)]/50"
                        : "border-[var(--flex-border)] hover:border-[var(--flex-accent)]/30"
                    }`}
                    style={{ width: w, height: 56 }}
                  >
                    {/* Thumbnail */}
                    {(s.imageUrl || s.videoUrl) ? (
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                          backgroundImage: `url(${s.imageUrl || ""})`,
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[var(--flex-card)]" />
                    )}

                    {/* Trim indicators */}
                    {(s.trimStart ?? 0) > 0 && (
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-black/60"
                        style={{
                          width: `${((s.trimStart ?? 0) / s.durationSec) * 100}%`,
                        }}
                      />
                    )}
                    {(s.trimEnd ?? s.durationSec) < s.durationSec && (
                      <div
                        className="absolute top-0 right-0 bottom-0 bg-black/60"
                        style={{
                          width: `${((s.durationSec - (s.trimEnd ?? s.durationSec)) / s.durationSec) * 100}%`,
                        }}
                      />
                    )}

                    {/* Label */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                      <div className="truncate text-[9px] font-semibold text-white">
                        {s.title}
                      </div>
                      <div className="text-[8px] text-white/60">
                        {formatTime(dur)}
                      </div>
                    </div>

                    {/* Audio level bar */}
                    <div className="absolute top-1 right-1 h-6 w-1.5 overflow-hidden rounded-full bg-black/40">
                      <div
                        className="absolute bottom-0 w-full rounded-full bg-green-400"
                        style={{ height: `${(s.audioVolume ?? 1) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Property Inspector ──────────────────────────── */}
        <div className="z-10 w-72 shrink-0 overflow-y-auto border-l border-[var(--flex-border)] glass-panel backdrop-blur-2xl">
          {selected ? (
            <div className="space-y-0 divide-y divide-[var(--flex-border)]">
              {/* Scene header */}
              <div className="p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--flex-accent)]">
                  Scene {selected.index + 1}
                </div>
                <div className="mt-0.5 text-sm font-bold truncate">
                  {selected.title}
                </div>
                <div className="mt-1 text-[10px] text-[var(--flex-muted)]">
                  {selected.location} - {selected.timeOfDay}
                </div>
              </div>

              {/* Scene actions */}
              <div className="flex gap-1 p-3">
                <button
                  type="button"
                  onClick={() => duplicateScene(selected.id)}
                  className="flex-1 rounded-md border border-[var(--flex-border)] bg-[var(--flex-card)] py-1.5 text-[10px] font-semibold transition hover:border-[var(--flex-accent)]"
                  title="Dupliquer (Ctrl+D)"
                >
                  Dupliquer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const mid =
                      ((selected.trimStart ?? 0) +
                        (selected.trimEnd ?? selected.durationSec)) /
                      2;
                    splitScene(selected.id, mid);
                  }}
                  className="flex-1 rounded-md border border-[var(--flex-border)] bg-[var(--flex-card)] py-1.5 text-[10px] font-semibold transition hover:border-[var(--flex-accent)]"
                >
                  Diviser
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Supprimer "${selected.title}" ?`))
                      deleteScene(selected.id);
                  }}
                  className="flex-1 rounded-md border border-[var(--flex-border)] bg-[var(--flex-card)] py-1.5 text-[10px] font-semibold text-red-400 transition hover:border-red-500/50"
                  title="Supprimer (Delete)"
                >
                  Supprimer
                </button>
              </div>

              {/* Trim controls */}
              <div className="p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--flex-muted)]">
                  Trim
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--flex-muted)]">
                      <span>Debut</span>
                      <span>{formatTime(selected.trimStart ?? 0)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={selected.durationSec}
                      step={0.1}
                      value={selected.trimStart ?? 0}
                      onChange={(e) =>
                        updateScene(selected.id, {
                          trimStart: clamp(
                            parseFloat(e.target.value),
                            0,
                            (selected.trimEnd ?? selected.durationSec) - 0.1
                          ),
                        })
                      }
                      className="w-full accent-[var(--flex-accent)]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--flex-muted)]">
                      <span>Fin</span>
                      <span>
                        {formatTime(selected.trimEnd ?? selected.durationSec)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={selected.durationSec}
                      step={0.1}
                      value={selected.trimEnd ?? selected.durationSec}
                      onChange={(e) =>
                        updateScene(selected.id, {
                          trimEnd: clamp(
                            parseFloat(e.target.value),
                            (selected.trimStart ?? 0) + 0.1,
                            selected.durationSec
                          ),
                        })
                      }
                      className="w-full accent-[var(--flex-accent)]"
                    />
                  </div>
                  <div className="rounded-md bg-[var(--flex-card)] p-2 text-center text-[11px] font-semibold">
                    Duree effective : {formatTime(getEffectiveDuration(selected))}
                  </div>
                </div>
              </div>

              {/* Transition */}
              <div className="p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--flex-muted)]">
                  Transition d&apos;entree
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {TRANSITION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        updateScene(selected.id, { transitionIn: opt.value })
                      }
                      className={`rounded-md px-1 py-2 text-center text-[9px] font-semibold transition ${
                        (selected.transitionIn ?? "cut") === opt.value
                          ? "bg-[var(--flex-accent)] text-white"
                          : "bg-[var(--flex-card)] text-[var(--flex-muted)] hover:text-[var(--flex-text)]"
                      }`}
                    >
                      <TransitionIcon type={opt.value} />
                      <div className="mt-0.5">{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio */}
              <div className="p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--flex-muted)]">
                  Audio
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--flex-muted)]">
                      <span>Volume scene</span>
                      <span>{Math.round((selected.audioVolume ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={selected.audioVolume ?? 1}
                      onChange={(e) =>
                        updateScene(selected.id, {
                          audioVolume: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[var(--flex-accent)]"
                    />
                    {/* Volume bar visual */}
                    <div className="mt-1 flex h-2 gap-px overflow-hidden rounded-full">
                      {Array.from({ length: 20 }).map((_, k) => (
                        <div
                          key={k}
                          className={`flex-1 rounded-sm ${
                            k / 20 < (selected.audioVolume ?? 1)
                              ? k < 14
                                ? "bg-green-500"
                                : k < 17
                                ? "bg-yellow-500"
                                : "bg-red-500"
                              : "bg-[var(--flex-border)]"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--flex-muted)]">
                      <span>Musique (master)</span>
                      <span>{masterVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={masterVolume}
                      onChange={(e) => setMasterVolume(parseInt(e.target.value))}
                      className="w-full accent-[var(--flex-accent)]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--flex-muted)]">
                      <span>Voix-off</span>
                      <span>{voiceoverVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={voiceoverVolume}
                      onChange={(e) =>
                        setVoiceoverVolume(parseInt(e.target.value))
                      }
                      className="w-full accent-[var(--flex-accent)]"
                    />
                  </div>
                </div>
              </div>

              {/* Text Overlays */}
              <div className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--flex-muted)]">
                    Textes ({selected.textOverlays?.length ?? 0})
                  </span>
                  <button
                    type="button"
                    onClick={() => addTextOverlay(selected.id)}
                    className="rounded-md bg-[var(--flex-card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flex-accent)] transition hover:bg-[var(--flex-accent)] hover:text-white"
                  >
                    + Ajouter
                  </button>
                </div>
                <div className="space-y-2">
                  {(selected.textOverlays ?? []).map((overlay, oi) => (
                    <div
                      key={oi}
                      className="rounded-md border border-[var(--flex-border)] bg-[var(--flex-card)] p-2"
                    >
                      <div className="flex items-center gap-1 mb-1.5">
                        <input
                          type="text"
                          value={overlay.text}
                          onChange={(e) =>
                            updateTextOverlay(selected.id, oi, {
                              text: e.target.value,
                            })
                          }
                          className="!py-1 !text-[11px] flex-1"
                          placeholder="Texte..."
                        />
                        <button
                          type="button"
                          onClick={() =>
                            removeTextOverlay(selected.id, oi)
                          }
                          className="shrink-0 rounded px-1.5 py-1 text-[10px] text-red-400 transition hover:bg-red-500/20"
                        >
                          X
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <div>
                          <span className="text-[9px] text-[var(--flex-muted)]">
                            X {overlay.x}%
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={overlay.x}
                            onChange={(e) =>
                              updateTextOverlay(selected.id, oi, {
                                x: parseInt(e.target.value),
                              })
                            }
                            className="w-full accent-[var(--flex-accent)]"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-[var(--flex-muted)]">
                            Y {overlay.y}%
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={overlay.y}
                            onChange={(e) =>
                              updateTextOverlay(selected.id, oi, {
                                y: parseInt(e.target.value),
                              })
                            }
                            className="w-full accent-[var(--flex-accent)]"
                          />
                        </div>
                      </div>
                      <div className="mt-1 grid grid-cols-3 gap-1">
                        <div>
                          <span className="text-[9px] text-[var(--flex-muted)]">
                            Taille
                          </span>
                          <input
                            type="number"
                            min={8}
                            max={120}
                            value={overlay.fontSize}
                            onChange={(e) =>
                              updateTextOverlay(selected.id, oi, {
                                fontSize: parseInt(e.target.value) || 24,
                              })
                            }
                            className="!py-0.5 !text-[10px]"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-[var(--flex-muted)]">
                            Couleur
                          </span>
                          <input
                            type="color"
                            value={overlay.color}
                            onChange={(e) =>
                              updateTextOverlay(selected.id, oi, {
                                color: e.target.value,
                              })
                            }
                            className="h-6 w-full cursor-pointer rounded border-0 p-0"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-[var(--flex-muted)]">
                            Temps
                          </span>
                          <div className="flex gap-0.5 text-[9px]">
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={overlay.startSec}
                              onChange={(e) =>
                                updateTextOverlay(selected.id, oi, {
                                  startSec:
                                    parseFloat(e.target.value) || 0,
                                })
                              }
                              className="!py-0.5 !text-[9px] w-1/2"
                              title="Debut (sec)"
                            />
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={overlay.endSec}
                              onChange={(e) =>
                                updateTextOverlay(selected.id, oi, {
                                  endSec:
                                    parseFloat(e.target.value) ||
                                    selected.durationSec,
                                })
                              }
                              className="!py-0.5 !text-[9px] w-1/2"
                              title="Fin (sec)"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export info */}
              <div className="p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--flex-muted)]">
                  Export
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--flex-muted)]">Scenes</span>
                    <span className="font-semibold">{scenes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--flex-muted)]">
                      Duree estimee
                    </span>
                    <span className="font-semibold">
                      {formatTime(totalDuration)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--flex-muted)]">
                      Videos pretes
                    </span>
                    <span className="font-semibold">
                      {scenes.filter((s) => s.videoUrl).length}/{scenes.length}
                    </span>
                  </div>
                </div>
                {onExport && (
                  <div className="mt-3 space-y-1">
                    <button
                      type="button"
                      onClick={() => onExport("original")}
                      className="w-full rounded-md bg-[var(--flex-accent)] py-2 text-[11px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
                    >
                      Exporter le film
                    </button>
                    <button
                      type="button"
                      onClick={() => onExport("compressed")}
                      className="w-full rounded-md border border-[var(--flex-border)] bg-[var(--flex-card)] py-2 text-[11px] font-semibold text-[var(--flex-muted)] transition hover:border-[var(--flex-accent)]"
                    >
                      Export compresse
                    </button>
                  </div>
                )}
              </div>

              {/* Keyboard shortcuts reference */}
              <div className="p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--flex-muted)]">
                  Raccourcis
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-[var(--flex-muted)]">
                  <span>Espace</span><span>Lecture/Pause</span>
                  <span>[ ]</span><span>Trim debut/fin</span>
                  <span>Delete</span><span>Supprimer scene</span>
                  <span>Ctrl+Z</span><span>Annuler</span>
                  <span>Ctrl+D</span><span>Dupliquer</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <div className="mb-2 text-3xl opacity-30">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <path d="M12 6v12M7 6v12M17 6v12" />
                  </svg>
                </div>
                <div className="text-xs text-[var(--flex-muted)]">
                  Selectionne une scene dans la timeline ou la liste pour
                  voir ses proprietes.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small transition icon ──────────────────────────────────────────────

function TransitionIcon({ type }: { type: string }) {
  const size = 12;
  switch (type) {
    case "fade":
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" opacity={0.6}>
          <rect x="1" y="1" width="10" height="10" rx="2" opacity="0.3" />
          <rect x="3" y="3" width="6" height="6" rx="1" />
        </svg>
      );
    case "dissolve":
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" opacity={0.6}>
          <circle cx="4" cy="6" r="3" opacity="0.4" />
          <circle cx="8" cy="6" r="3" opacity="0.4" />
        </svg>
      );
    case "wipe-left":
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" opacity={0.6}>
          <path d="M8 1L4 6l4 5" />
        </svg>
      );
    case "wipe-right":
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" opacity={0.6}>
          <path d="M4 1l4 5-4 5" />
        </svg>
      );
    default: // cut
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" opacity={0.6}>
          <rect x="5" y="1" width="2" height="10" />
        </svg>
      );
  }
}
