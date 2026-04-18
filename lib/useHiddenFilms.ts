"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "aiflex.hiddenFilms";

/**
 * Client-side "Not interested" / hide title feature. Stores dismissed
 * film IDs in localStorage. The home page filters them out from the
 * feed before rendering. No server persistence — purely a local UX
 * preference, like Netflix's "Hide this title".
 */
export function useHiddenFilms() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setHiddenIds(new Set(JSON.parse(raw)));
    } catch {
      // Corrupted — reset
    }
  }, []);

  const hide = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, JSON.stringify([...next]));
      }
      return next;
    });
  }, []);

  const unhide = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, JSON.stringify([...next]));
      }
      return next;
    });
  }, []);

  const isHidden = useCallback(
    (id: string) => hiddenIds.has(id),
    [hiddenIds]
  );

  return { hiddenIds, hide, unhide, isHidden };
}
