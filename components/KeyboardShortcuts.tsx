"use client";

import { useEffect, useState } from "react";

const SHORTCUTS = [
  { keys: "Espace", action: "Play / Pause (dans le player)" },
  { keys: "←", action: "Scène précédente" },
  { keys: "→", action: "Scène suivante" },
  { keys: "?", action: "Afficher / masquer cette aide" },
];

/**
 * Global keyboard shortcut overlay. Press "?" anywhere (outside an input)
 * to toggle. Shows a floating card with all available shortcuts.
 */
export default function KeyboardShortcuts() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?") {
        e.preventDefault();
        setShow((s) => !s);
      }
      if (e.key === "Escape" && show) {
        setShow(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [show]);

  if (!show) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={() => setShow(false)}
      />
      <div className="fixed right-6 bottom-6 z-[71] w-80 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema animate-fadeUp">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black">Raccourcis clavier</h3>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="text-flex-muted transition hover:text-flex-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <ul className="space-y-3">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3">
              <kbd className="rounded-md border border-flex-border bg-flex-panel px-2.5 py-1 font-mono text-xs font-bold text-flex-text">
                {s.keys}
              </kbd>
              <span className="text-xs text-flex-muted">{s.action}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 text-center text-[10px] text-flex-muted">
          Appuie sur <kbd className="rounded border border-flex-border bg-flex-panel px-1 font-mono text-[10px]">?</kbd> pour fermer
        </div>
      </div>
    </>
  );
}
