"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up from 0 to `value` over `duration` ms on mount. Uses
 * requestAnimationFrame for smooth 60fps animation. If the value
 * changes, it re-animates from the current display to the new target.
 *
 * Used in dashboard stats and creator profiles for a polished feel.
 */
export default function AnimatedNumber({
  value,
  duration = 800,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(0);
  const startTimeRef = useRef(0);

  useEffect(() => {
    startRef.current = display;
    startTimeRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out cubic for a satisfying deceleration.
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(
        startRef.current + (value - startRef.current) * eased
      );
      setDisplay(current);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <>{format ? format(display) : display.toLocaleString("fr-FR")}</>;
}
