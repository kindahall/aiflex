"use client";

import Image from "next/image";
import { useState } from "react";
import type { Scene } from "@/lib/types";
import VideoControls from "./VideoControls";

interface Props {
  scenes: Scene[];
  onGenerateVideo?: (scene: Scene) => void;
  generatingIds?: Set<string>;
  onEditScene?: (sceneId: string, patch: Partial<Scene>) => void;
  onDeleteScene?: (sceneId: string) => void;
  onMoveScene?: (sceneId: string, direction: "up" | "down") => void;
}

export default function SceneGrid({
  scenes,
  onGenerateVideo,
  generatingIds,
  onEditScene,
  onDeleteScene,
  onMoveScene,
}: Props) {
  return (
    <div className="grid gap-5 animate-fadeUp sm:grid-cols-2 lg:grid-cols-3">
      {scenes.map((scene, i) => (
        <div key={scene.id} id={`scene-${scene.index}`}>
          <SceneCard
            scene={scene}
            generating={generatingIds?.has(scene.id) ?? false}
            onGenerateVideo={onGenerateVideo}
            onEditScene={onEditScene}
            onDelete={onDeleteScene}
            onMove={onMoveScene}
            isFirst={i === 0}
            isLast={i === scenes.length - 1}
          />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function SceneCard({
  scene,
  generating,
  onGenerateVideo,
  onEditScene,
  onDelete,
  onMove,
  isFirst,
  isLast,
}: {
  scene: Scene;
  generating: boolean;
  onGenerateVideo?: (scene: Scene) => void;
  onEditScene?: (sceneId: string, patch: Partial<Scene>) => void;
  onDelete?: (sceneId: string) => void;
  onMove?: (sceneId: string, direction: "up" | "down") => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const hasVideo = Boolean(scene.videoUrl);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-flex-border bg-flex-card shadow-cinema">
      {/* ── Thumbnail ────────────────────────────────────────────── */}
      <div className="relative aspect-video w-full bg-black">
        {hasVideo ? (
          <video
            src={scene.videoUrl}
            className="h-full w-full object-cover"
            controls
            playsInline
            muted
            loop
          />
        ) : scene.imageUrl ? (
          <Image
            src={scene.imageUrl}
            alt={scene.title}
            fill
            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
            className="object-cover"
            unoptimized
          />
        ) : null}
        {generating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-flex-accent border-t-transparent" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-flex-text">
                Génération vidéo…
              </div>
            </div>
          </div>
        )}
        <div className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px] font-bold text-flex-text backdrop-blur">
          #{String(scene.index + 1).padStart(2, "0")} · {scene.durationSec}s
        </div>
        {hasVideo && (
          <div className="absolute top-2 right-2 rounded-full bg-flex-accent/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            ● Vidéo IA
          </div>
        )}
      </div>

      {/* ── Body: read mode OR edit mode ─────────────────────────── */}
      {editing && onEditScene ? (
        <SceneEditForm
          scene={scene}
          onSave={(patch) => {
            onEditScene(scene.id, patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="truncate text-base font-bold">{scene.title}</h4>
            <div className="flex shrink-0 items-center gap-1">
              {onMove && !isFirst && (
                <button
                  type="button"
                  onClick={() => onMove(scene.id, "up")}
                  className="rounded-md border border-flex-border bg-flex-panel px-1.5 py-0.5 text-[10px] text-flex-muted transition hover:border-flex-accent"
                  title="Monter"
                >
                  ↑
                </button>
              )}
              {onMove && !isLast && (
                <button
                  type="button"
                  onClick={() => onMove(scene.id, "down")}
                  className="rounded-md border border-flex-border bg-flex-panel px-1.5 py-0.5 text-[10px] text-flex-muted transition hover:border-flex-accent"
                  title="Descendre"
                >
                  ↓
                </button>
              )}
              {onEditScene && !hasVideo && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-flex-border bg-flex-panel px-2 py-0.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
                >
                  ✎
                </button>
              )}
              {onDelete && !hasVideo && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Supprimer la scène « ${scene.title} » ?`))
                      onDelete(scene.id);
                  }}
                  className="rounded-md border border-flex-border bg-flex-panel px-1.5 py-0.5 text-[10px] text-flex-muted transition hover:border-red-500/50 hover:text-red-400"
                  title="Supprimer"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-flex-muted">
            {scene.location} · {scene.timeOfDay} · {scene.mood}
          </div>
          <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-flex-text/80">
            {scene.action}
          </p>
          {scene.dialogue && (
            <div className="mb-3 rounded-md border-l-2 border-flex-accent bg-flex-panel p-2 font-mono text-[11px] italic text-flex-muted whitespace-pre-line">
              {scene.dialogue}
            </div>
          )}
          {onGenerateVideo && !hasVideo && (
            <button
              type="button"
              onClick={() => onGenerateVideo(scene)}
              disabled={generating}
              className="w-full rounded-lg bg-flex-accent py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating
                ? "Génération en cours…"
                : "⟶ Générer la vidéo"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

const TIME_OPTIONS = [
  "matin",
  "midi",
  "après-midi",
  "crépuscule",
  "nuit",
  "aube",
];

function SceneEditForm({
  scene,
  onSave,
  onCancel,
}: {
  scene: Scene;
  onSave: (patch: Partial<Scene>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [location, setLocation] = useState(scene.location);
  const [timeOfDay, setTimeOfDay] = useState(scene.timeOfDay);
  const [characters, setCharacters] = useState(scene.characters.join(", "));
  const [action, setAction] = useState(scene.action);
  const [dialogue, setDialogue] = useState(scene.dialogue);
  const [mood, setMood] = useState(scene.mood);
  const [visualPrompt, setVisualPrompt] = useState(scene.visualPrompt);
  const [durationSec, setDurationSec] = useState(scene.durationSec);
  const [aspectRatio, setAspectRatio] = useState(scene.aspectRatio || "16:9");
  const [motionIntensity, setMotionIntensity] = useState(scene.motionIntensity || "normal");
  const [negativePrompt, setNegativePrompt] = useState(scene.negativePrompt || "");
  // Extra video controls managed by the VideoControls component.
  const [videoExtras, setVideoExtras] = useState<Partial<Scene>>({
    generationMode: scene.generationMode,
    referenceImageUrl: scene.referenceImageUrl,
    sourceVideoUrl: scene.sourceVideoUrl,
    cameraControl: scene.cameraControl,
    resolution: scene.resolution,
    seed: scene.seed,
    usePromptOptimizer: scene.usePromptOptimizer,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      title: title.trim(),
      location: location.trim(),
      timeOfDay: timeOfDay.trim(),
      characters: characters
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      action: action.trim(),
      dialogue: dialogue.trim(),
      mood: mood.trim(),
      visualPrompt: visualPrompt.trim(),
      durationSec: Math.max(3, Math.min(15, durationSec)),
      aspectRatio,
      motionIntensity,
      negativePrompt: negativePrompt.trim() || undefined,
      ...videoExtras,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-flex-border p-4">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-flex-accent">
        ✎ Édition scène #{scene.index + 1}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`title-${scene.id}`}>Titre</label>
          <input
            id={`title-${scene.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`location-${scene.id}`}>Lieu</label>
          <input
            id={`location-${scene.id}`}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`time-${scene.id}`}>Moment</label>
          <select
            id={`time-${scene.id}`}
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`mood-${scene.id}`}>Ambiance</label>
          <input
            id={`mood-${scene.id}`}
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="ex: tendu, onirique, mélancolique"
          />
        </div>
      </div>

      <div>
        <label htmlFor={`chars-${scene.id}`}>
          Personnages (séparés par des virgules)
        </label>
        <input
          id={`chars-${scene.id}`}
          value={characters}
          onChange={(e) => setCharacters(e.target.value)}
          placeholder="Héra, Jonas, le gardien"
        />
      </div>

      <div>
        <label htmlFor={`action-${scene.id}`}>Action & sous-texte</label>
        <textarea
          id={`action-${scene.id}`}
          rows={3}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor={`dialogue-${scene.id}`}>
          Dialogue (optionnel)
        </label>
        <textarea
          id={`dialogue-${scene.id}`}
          rows={2}
          value={dialogue}
          onChange={(e) => setDialogue(e.target.value)}
          placeholder="NOM : réplique."
        />
      </div>

      {/* Dynamic video controls based on admin's selected model */}
      <VideoControls
        scene={{
          ...scene,
          ...videoExtras,
          aspectRatio,
          motionIntensity,
          negativePrompt,
          durationSec,
        }}
        onChange={(patch) => {
          if (patch.aspectRatio) setAspectRatio(patch.aspectRatio);
          if (patch.motionIntensity) setMotionIntensity(patch.motionIntensity);
          if ("negativePrompt" in patch) setNegativePrompt(patch.negativePrompt || "");
          if (patch.durationSec) setDurationSec(patch.durationSec);
          // All other fields go into videoExtras.
          const rest = { ...patch };
          delete rest.aspectRatio;
          delete rest.motionIntensity;
          delete rest.negativePrompt;
          delete rest.durationSec;
          if (Object.keys(rest).length > 0) {
            setVideoExtras((prev) => ({ ...prev, ...rest }));
          }
        }}
      />

      <div>
        <div className="flex items-end justify-between">
          <label htmlFor={`vp-${scene.id}`}>
            Visual prompt (envoyé au modèle vidéo — en anglais)
          </label>
          <EnhanceButton
            prompt={visualPrompt}
            mood={mood}
            onEnhanced={setVisualPrompt}
          />
        </div>
        <textarea
          id={`vp-${scene.id}`}
          rows={4}
          value={visualPrompt}
          onChange={(e) => setVisualPrompt(e.target.value)}
          className="font-mono text-[11px]"
        />
        <div className="mt-1 text-[10px] text-flex-muted">
          Ce texte contrôle le rendu visuel de la scène. Cadrage, lumière,
          palette, mouvement de caméra — tout compte. Clique « ✦ Améliorer »
          pour que l&apos;IA l&apos;optimise automatiquement.
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="rounded-lg bg-flex-accent px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110"
        >
          Sauvegarder
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────

function EnhanceButton({
  prompt,
  mood,
  onEnhanced,
}: {
  prompt: string;
  mood: string;
  onEnhanced: (enhanced: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function enhance() {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, mood }),
      });
      const data = await res.json();
      if (data.enhanced) {
        onEnhanced(data.enhanced);
      }
    } catch {
      // Silent — the user still has the original
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={enhance}
      disabled={busy || !prompt.trim()}
      className="mb-1 shrink-0 rounded-md bg-flex-accent px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50"
    >
      {busy ? "Amélioration…" : "✦ Améliorer"}
    </button>
  );
}
