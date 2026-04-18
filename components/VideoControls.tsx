"use client";

import { useEffect, useState } from "react";
import type { Scene } from "@/lib/types";
import {
  getVideoCapabilities,
  type GenerationMode,
  type VideoModelCapabilities,
} from "@/lib/video-capabilities";
import FileUpload from "./FileUpload";

/**
 * Dynamic video generation controls that adapt to the currently
 * configured video model. Fetches the active model from the admin
 * settings and shows only the controls that model supports.
 *
 * Used inside the SceneEditForm in the studio.
 */
export default function VideoControls({
  scene,
  onChange,
}: {
  scene: Scene;
  onChange: (patch: Partial<Scene>) => void;
}) {
  const [caps, setCaps] = useState<VideoModelCapabilities | null>(null);
  const [modelLabel, setModelLabel] = useState("");

  useEffect(() => {
    fetch("/api/site-content", { cache: "no-store" }).catch(() => {});
    // Fetch settings to know which video model is active.
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.settings?.videoModel) {
          setCaps(getVideoCapabilities(d.settings.videoModel));
          // Find label from video models list
          const vm = d.videoModels?.find(
            (m: { id: string }) => m.id === d.settings.videoModel
          );
          setModelLabel(vm?.label || d.settings.videoModel);
        }
      })
      .catch(() => {
        // Fallback: use defaults
        setCaps(getVideoCapabilities(""));
      });
  }, []);

  if (!caps) return null;

  return (
    <div className="space-y-3 rounded-xl border border-flex-accent/20 bg-flex-accent/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-flex-accent">
          Contrôles vidéo
        </div>
        <div className="text-[10px] text-flex-muted">
          {modelLabel}
        </div>
      </div>

      {/* Mode de génération */}
      {caps.modes.length > 1 && (
        <div>
          <label className="!mb-1 !text-[10px]">Mode de génération</label>
          <div className="flex flex-wrap gap-2">
            {caps.modes.map((mode) => {
              const active = (scene.generationMode || "text-to-video") === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ generationMode: mode })}
                  className={`rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition ${
                    active
                      ? "border-flex-accent bg-flex-accent/10 text-flex-accent"
                      : "border-flex-border bg-flex-card text-flex-muted hover:border-flex-accent/50"
                  }`}
                >
                  {MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reference image upload (image-to-video mode) */}
      {scene.generationMode === "image-to-video" && (
        <FileUpload
          accept="image"
          label="Image de référence (sera animée par l'IA)"
          currentUrl={scene.referenceImageUrl}
          onUploaded={(url) => onChange({ referenceImageUrl: url || undefined })}
        />
      )}

      {/* Source video upload (video-to-video mode) */}
      {scene.generationMode === "video-to-video" && (
        <FileUpload
          accept="video"
          label="Vidéo source (sera transformée par l'IA)"
          currentUrl={scene.sourceVideoUrl}
          onUploaded={(url) => onChange({ sourceVideoUrl: url || undefined })}
        />
      )}

      {/* Multiple reference images for Seedance (up to 9) */}
      {caps.maxReferenceImages > 1 &&
        scene.generationMode !== "video-to-video" && (
          <div>
            <label className="!mb-1 !text-[10px]">
              Images de référence supplémentaires
              <span className="ml-1 font-normal text-flex-muted">
                (max {caps.maxReferenceImages} — cohérence personnage)
              </span>
            </label>
            <FileUpload
              accept="image"
              label=""
              currentUrl={undefined}
              onUploaded={(url) => {
                // Append to referenceImageUrl as comma-separated
                const current = scene.referenceImageUrl || "";
                const urls = current ? current.split(",") : [];
                if (urls.length < caps.maxReferenceImages) {
                  urls.push(url);
                  onChange({ referenceImageUrl: urls.join(",") });
                }
              }}
            />
            {scene.referenceImageUrl &&
              scene.referenceImageUrl.includes(",") && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {scene.referenceImageUrl.split(",").map((url, i) => (
                    <div
                      key={i}
                      className="relative h-12 w-12 overflow-hidden rounded-md border border-flex-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Ref ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Duration */}
        <div>
          <label className="!mb-1 !text-[10px]">Durée</label>
          <select
            value={scene.durationSec}
            onChange={(e) =>
              onChange({ durationSec: Number(e.target.value) })
            }
          >
            {caps.durations.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </div>

        {/* Resolution */}
        {caps.resolutions.length > 1 && (
          <div>
            <label className="!mb-1 !text-[10px]">Résolution</label>
            <select
              value={scene.resolution || caps.resolutions[0]}
              onChange={(e) => onChange({ resolution: e.target.value })}
            >
              {caps.resolutions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Aspect ratio */}
        <div>
          <label className="!mb-1 !text-[10px]">Ratio</label>
          <select
            value={scene.aspectRatio || "16:9"}
            onChange={(e) =>
              onChange({
                aspectRatio: e.target.value as "16:9" | "9:16" | "1:1",
              })
            }
          >
            {caps.aspectRatios.map((ar) => (
              <option key={ar} value={ar}>
                {ar}
                {ar === "16:9"
                  ? " Cinéma"
                  : ar === "9:16"
                    ? " Vertical"
                    : " Carré"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Camera controls */}
      {caps.cameraControls && caps.cameraPresets && (
        <div>
          <label className="!mb-1 !text-[10px]">
            Mouvement caméra
            <span className="ml-1 font-normal text-flex-muted">
              ({caps.cameraFormat === "bracket" ? "max 3" : "descriptif"})
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {caps.cameraPresets.map((preset) => {
              const current = scene.cameraControl || "";
              const isActive = current.includes(preset.value);
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    if (isActive) {
                      onChange({
                        cameraControl: current
                          .replace(
                            caps.cameraFormat === "bracket"
                              ? `[${preset.value}]`
                              : preset.value,
                            ""
                          )
                          .trim(),
                      });
                    } else {
                      const sep =
                        caps.cameraFormat === "bracket"
                          ? `[${preset.value}]`
                          : preset.value;
                      onChange({
                        cameraControl: current
                          ? `${current} ${sep}`
                          : sep,
                      });
                    }
                  }}
                  className={`rounded-md border px-2 py-1 text-[9px] font-semibold transition ${
                    isActive
                      ? "border-flex-accent bg-flex-accent/10 text-flex-accent"
                      : "border-flex-border bg-flex-card text-flex-muted hover:border-flex-accent/50"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Negative prompt */}
      {caps.negativePrompt && (
        <div>
          <label className="!mb-1 !text-[10px]">
            Negative prompt
          </label>
          <input
            value={scene.negativePrompt || ""}
            onChange={(e) => onChange({ negativePrompt: e.target.value })}
            placeholder="blur, text, watermark, distortion…"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {/* Prompt optimizer */}
        {caps.promptOptimizer && (
          <label className="flex items-center gap-2 text-[10px] font-semibold text-flex-text">
            <input
              type="checkbox"
              checked={scene.usePromptOptimizer ?? false}
              onChange={(e) =>
                onChange({ usePromptOptimizer: e.target.checked })
              }
              className="!h-4 !w-4 !rounded !border-flex-border !m-0"
            />
            Optimiseur de prompt
          </label>
        )}

        {/* Seed */}
        {caps.seedLocking && (
          <div className="flex items-center gap-2">
            <label className="!mb-0 !text-[10px]">Seed</label>
            <input
              type="number"
              min={0}
              value={scene.seed ?? ""}
              onChange={(e) =>
                onChange({
                  seed: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Auto"
              className="!w-20 !py-1 !text-[10px]"
            />
          </div>
        )}

        {/* Audio badge */}
        {caps.audio && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
            Audio inclus
          </span>
        )}
      </div>
    </div>
  );
}

const MODE_LABELS: Record<GenerationMode, string> = {
  "text-to-video": "✦ Texte → Vidéo",
  "image-to-video": "🖼 Image → Vidéo",
  "video-to-video": "🔄 Vidéo → Vidéo",
};
