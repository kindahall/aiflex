"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Simple cooldown hook to prevent rapid-fire user actions (spam-clicking
 * like/comment buttons). Returns a boolean `cooling` and a `trigger()`
 * function. After `trigger()` is called, `cooling` stays true for `ms`
 * milliseconds, then resets.
 *
 * Usage:
 *   const [cooling, cool] = useCooldown(500);
 *   // after an action succeeds:
 *   cool();
 *   // disable the button while cooling:
 *   <button disabled={busy || cooling}>
 */
export function useCooldown(ms: number): [boolean, () => void] {
  const [cooling, setCooling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    setCooling(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCooling(false), ms);
  }, [ms]);

  return [cooling, trigger];
}
