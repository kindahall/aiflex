"use client";

import { useCallback, useRef } from "react";
import AssemblyPlayer from "./AssemblyPlayer";
import { useAuth } from "@/lib/useAuth";
import type { Scene } from "@/lib/types";

/**
 * Wrapper around AssemblyPlayer that auto-saves viewing progress to
 * /api/me/progress. Debounced — fires at most once every 3 seconds to
 * avoid spamming the server on fast scene navigation.
 *
 * Used on the public `/watch/[id]` page. Anonymous viewers get the same
 * player but without progress saving.
 */
export default function WatchPlayer({
  projectId,
  scenes,
  title,
}: {
  projectId: string;
  scenes: Scene[];
  title: string;
}) {
  const { user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProgress = useCallback(
    (sceneIndex: number, progress: number) => {
      if (!user) return;
      // Debounce: cancel any pending save and schedule a new one.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fetch("/api/me/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId,
            lastSceneIndex: sceneIndex,
            progress,
          }),
        }).catch(() => {});
      }, 3000);
    },
    [user, projectId]
  );

  return (
    <AssemblyPlayer
      scenes={scenes}
      title={title}
      onProgressChange={handleProgress}
    />
  );
}
