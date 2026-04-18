"use client";

import { useEffect, useState } from "react";

export type TransitionType = "cut" | "fade" | "dissolve" | "wipe-left" | "wipe-right";

const TRANSITION_DURATION = 800; // ms

/**
 * Renders a CSS-based transition overlay between scenes.
 * Wrap two video elements: the outgoing scene fades/wipes out while the
 * incoming scene appears. This component only controls the CSS animation;
 * actual video elements are managed by the parent.
 */
export function TransitionOverlay({
  type,
  active,
  onComplete,
}: {
  type: TransitionType;
  /** True when the transition should play. */
  active: boolean;
  onComplete?: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    if (!active) {
      setPhase("idle");
      return;
    }
    if (type === "cut") {
      onComplete?.();
      return;
    }
    setPhase("running");
    const t = setTimeout(() => {
      setPhase("done");
      onComplete?.();
    }, TRANSITION_DURATION);
    return () => clearTimeout(t);
  }, [active, type, onComplete]);

  if (phase !== "running" || type === "cut") return null;

  const base = "absolute inset-0 z-50 pointer-events-none";

  if (type === "fade") {
    return (
      <div
        className={base}
        style={{
          backgroundColor: "black",
          animation: `fadeInOut ${TRANSITION_DURATION}ms ease-in-out forwards`,
        }}
      />
    );
  }

  if (type === "dissolve") {
    return (
      <div
        className={base}
        style={{
          backgroundColor: "black",
          animation: `dissolveThrough ${TRANSITION_DURATION}ms ease-in-out forwards`,
        }}
      />
    );
  }

  if (type === "wipe-left") {
    return (
      <div
        className={base}
        style={{
          backgroundColor: "black",
          animation: `wipeLeft ${TRANSITION_DURATION}ms ease-in-out forwards`,
        }}
      />
    );
  }

  if (type === "wipe-right") {
    return (
      <div
        className={base}
        style={{
          backgroundColor: "black",
          animation: `wipeRight ${TRANSITION_DURATION}ms ease-in-out forwards`,
        }}
      />
    );
  }

  return null;
}

/**
 * Inject the keyframes into the page. Place this once at the layout level
 * or inside the editor page.
 */
export function TransitionStyles() {
  return (
    <style jsx global>{`
      @keyframes fadeInOut {
        0% { opacity: 0; }
        40% { opacity: 1; }
        60% { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes dissolveThrough {
        0% { opacity: 0; }
        30% { opacity: 0.7; }
        70% { opacity: 0.7; }
        100% { opacity: 0; }
      }
      @keyframes wipeLeft {
        0% { clip-path: inset(0 100% 0 0); }
        40% { clip-path: inset(0 0 0 0); }
        60% { clip-path: inset(0 0 0 0); }
        100% { clip-path: inset(0 0 0 100%); }
      }
      @keyframes wipeRight {
        0% { clip-path: inset(0 0 0 100%); }
        40% { clip-path: inset(0 0 0 0); }
        60% { clip-path: inset(0 0 0 0); }
        100% { clip-path: inset(0 100% 0 0); }
      }
    `}</style>
  );
}

export const TRANSITION_OPTIONS: { value: TransitionType; label: string }[] = [
  { value: "cut", label: "Coupe" },
  { value: "fade", label: "Fondu" },
  { value: "dissolve", label: "Dissolution" },
  { value: "wipe-left", label: "Volet gauche" },
  { value: "wipe-right", label: "Volet droite" },
];

export { TRANSITION_DURATION };
