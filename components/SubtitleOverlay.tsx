"use client";

import { useMemo, useState } from "react";
import type { SubtitleEntry } from "@/lib/types";

type FontSize = "S" | "M" | "L";

const FONT_SIZES: Record<FontSize, string> = {
  S: "text-xs",
  M: "text-sm",
  L: "text-base",
};

/**
 * Subtitle overlay rendered on top of the video player.
 * Shows subtitle text at the correct time, styled with a
 * semi-transparent black background and white text.
 */
export default function SubtitleOverlay({
  subtitles,
  currentTimeSec,
  enabled,
}: {
  subtitles: SubtitleEntry[];
  currentTimeSec: number;
  enabled: boolean;
}) {
  const [fontSize, setFontSize] = useState<FontSize>("M");

  const activeEntry = useMemo(() => {
    if (!enabled || subtitles.length === 0) return null;
    return (
      subtitles.find(
        (s) => currentTimeSec >= s.startSec && currentTimeSec < s.endSec
      ) || null
    );
  }, [subtitles, currentTimeSec, enabled]);

  if (!enabled) return null;

  return (
    <>
      {/* Font size control — top-left, small and unobtrusive */}
      <div className="absolute top-3 left-3 z-10 flex gap-1">
        {(["S", "M", "L"] as const).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => setFontSize(size)}
            className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold transition ${
              fontSize === size
                ? "bg-flex-accent text-white"
                : "bg-black/50 text-white/60 hover:text-white"
            }`}
            aria-label={`Taille sous-titres ${size}`}
          >
            {size}
          </button>
        ))}
      </div>

      {/* Active subtitle text */}
      {activeEntry && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4">
          <div
            className={`max-w-[80%] rounded-lg bg-black/75 px-4 py-2 text-center leading-snug text-white backdrop-blur-sm ${FONT_SIZES[fontSize]}`}
          >
            {activeEntry.speaker && (
              <span className="mr-1 font-bold text-flex-accent">
                {activeEntry.speaker}:
              </span>
            )}
            {activeEntry.text}
          </div>
        </div>
      )}
    </>
  );
}
