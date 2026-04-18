"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "aiflex.install.dismissed";
const INSTALLED_KEY = "aiflex.install.done";

// Minimal typing for the non-standard beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA install prompt (V7 §A10 / V8 §A6).
 *
 * Two flavors:
 *   - Android/Desktop Chrome: intercept the `beforeinstallprompt` event and
 *     show a rich install CTA. Dismissal stored 30 days.
 *   - iOS Safari: no auto-prompt available; show a gentle instruction panel
 *     ("Partager → Sur l'écran d'accueil") once per install check.
 *
 * Auto-hides if the app is already installed (`display-mode: standalone`).
 */
export default function InstallPrompt() {
  const [variant, setVariant] = useState<"android" | "ios" | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Skip if already installed as PWA
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // Safari-specific standalone check
      (typeof (window.navigator as unknown as { standalone?: boolean }).standalone ===
        "boolean" &&
        (window.navigator as unknown as { standalone?: boolean }).standalone === true);
    if (standalone) {
      localStorage.setItem(INSTALLED_KEY, "1");
      return;
    }

    // Skip if dismissed within the last 30 days
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < 30 * 24 * 60 * 60 * 1000) return;

    // iOS detection: no beforeinstallprompt available, give manual guidance
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    if (isIOS) {
      // Delay slightly to not flash above first paint
      const t = setTimeout(() => {
        setVariant("ios");
        setOpen(true);
      }, 2500);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVariant("android");
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setOpen(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "1");
    } else {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    }
    setOpen(false);
  }

  if (!open || !variant) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-title"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md animate-fadeUp rounded-3xl border border-flex-border bg-flex-panel/95 p-5 shadow-cinema backdrop-blur-xl sm:right-4 sm:left-auto sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-flex-accent to-flex-accent2 text-white">
          <span aria-hidden className="text-xl">🎬</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="install-title" className="font-semibold">
            Installe AiFlex
          </h3>
          {variant === "android" ? (
            <p className="mt-1 text-sm text-flex-muted">
              Ajoute AiFlex à ton écran d&apos;accueil pour un accès rapide, les
              notifications et une expérience plein écran.
            </p>
          ) : (
            <p className="mt-1 text-sm text-flex-muted">
              Tape <IOSIcon name="share" /> Partager puis{" "}
              <IOSIcon name="add" /> Sur l&apos;écran d&apos;accueil.
            </p>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={dismiss}
              className="rounded-full px-3 py-1.5 text-xs text-flex-muted hover:text-flex-text"
            >
              Plus tard
            </button>
            {variant === "android" && (
              <button
                onClick={install}
                className="rounded-full bg-flex-accent px-4 py-1.5 text-xs font-medium text-white hover:brightness-110"
              >
                Installer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IOSIcon({ name }: { name: "share" | "add" }) {
  return (
    <span className="mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded bg-flex-card text-xs align-middle">
      {name === "share" ? "⇧" : "+"}
    </span>
  );
}
