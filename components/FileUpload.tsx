"use client";

import Image from "next/image";
import { useRef, useState } from "react";

/**
 * Drag-and-drop + click-to-browse file upload component. Uploads to
 * /api/upload and returns the public URL via the `onUploaded` callback.
 *
 * Supports images and videos. Shows a preview after upload.
 */
export default function FileUpload({
  accept,
  label,
  currentUrl,
  onUploaded,
}: {
  /** "image" | "video" | "both" */
  accept: "image" | "video" | "both";
  label: string;
  currentUrl?: string;
  onUploaded: (url: string, type: "image" | "video") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const acceptTypes =
    accept === "image"
      ? "image/jpeg,image/png,image/webp"
      : accept === "video"
        ? "video/mp4,video/webm"
        : "image/jpeg,image/png,image/webp,video/mp4,video/webm";

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur upload");
      onUploaded(data.url, data.type);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    upload(files[0]);
  }

  const hasPreview = Boolean(currentUrl);
  const isVideo = currentUrl?.match(/\.(mp4|webm)$/i);

  return (
    <div>
      <label className="!mb-1 !text-[10px]">{label}</label>

      {/* Preview */}
      {hasPreview && (
        <div className="mb-2 relative aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-flex-border bg-black">
          {isVideo ? (
            <video
              src={currentUrl}
              className="h-full w-full object-cover"
              controls
              muted
              playsInline
            />
          ) : (
            <Image
              src={currentUrl!}
              alt="Preview"
              fill
              className="object-cover"
              unoptimized
            />
          )}
          <button
            type="button"
            onClick={() => onUploaded("", "image")}
            className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[10px] text-white transition hover:bg-red-500"
            title="Retirer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${
          dragOver
            ? "border-flex-accent bg-flex-accent/10"
            : "border-flex-border bg-flex-card hover:border-flex-accent/50"
        } ${uploading ? "pointer-events-none opacity-50" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin text-flex-accent">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <span className="text-xs font-semibold text-flex-muted">
              Upload en cours…
            </span>
          </div>
        ) : (
          <>
            <div className="mb-1 text-2xl">
              {accept === "video" ? "🎥" : accept === "image" ? "🖼" : "📁"}
            </div>
            <div className="text-xs font-semibold text-flex-muted">
              Glisse un fichier ici ou clique pour parcourir
            </div>
            <div className="mt-1 text-[10px] text-flex-muted/60">
              {accept === "image"
                ? "JPG, PNG, WebP — max 50 Mo"
                : accept === "video"
                  ? "MP4, WebM — max 50 Mo"
                  : "Images ou vidéos — max 50 Mo"}
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="mt-1 text-[10px] text-red-400">⚠ {error}</div>
      )}
    </div>
  );
}
