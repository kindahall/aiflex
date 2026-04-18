"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "aiflex.cookie.consent.v2";

export type CookieConsent = {
  essential: true; // always on
  analytics: boolean;
  marketing: boolean;
  version: string;
  decidedAt: number;
};

const CURRENT_VERSION = "1";

/**
 * 3-category cookie consent banner (V8 §B8.5).
 *
 * Categories:
 *   - essential (session, consent, CSRF) — always on, no opt-out
 *   - analytics (PostHog auto-hébergé) — opt-in
 *   - marketing (affiliation, remarketing) — opt-in
 *
 * Decision is stored in localStorage and also exposed as a global event
 * `aiflex:cookie-consent` so consumers (Sentry, PostHog bootstrap) can
 * reactively enable themselves.
 */
export default function CookieNotice() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as CookieConsent;
        if (parsed.version === CURRENT_VERSION) {
          // Already decided for this version — hide banner
          window.dispatchEvent(
            new CustomEvent("aiflex:cookie-consent", { detail: parsed })
          );
          return;
        }
      } catch {
        /* fall through → show banner */
      }
    }
    // Slight delay so the banner doesn't flash above first paint
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, []);

  function persist(consent: Omit<CookieConsent, "version" | "decidedAt">) {
    const full: CookieConsent = {
      ...consent,
      version: CURRENT_VERSION,
      decidedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(full));
    window.dispatchEvent(new CustomEvent("aiflex:cookie-consent", { detail: full }));
    setShow(false);
  }

  function acceptAll() {
    persist({ essential: true, analytics: true, marketing: true });
  }
  function rejectAll() {
    persist({ essential: true, analytics: false, marketing: false });
  }
  function savePreferences() {
    persist({ essential: true, analytics, marketing });
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl animate-fadeUp rounded-3xl border border-flex-border bg-flex-panel/95 p-5 shadow-cinema backdrop-blur-xl"
    >
      {!expanded ? (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex-1 text-sm leading-relaxed">
            <p id="cookie-consent-title" className="font-semibold">
              Ta vie privée compte
            </p>
            <p className="mt-1 text-flex-muted">
              AIflex utilise des cookies essentiels pour fonctionner. On aimerait
              aussi mesurer l&apos;usage (analytics) et suivre nos campagnes
              d&apos;affiliation (marketing) — uniquement avec ton accord.{" "}
              <Link
                href="/legal/cookies"
                className="text-flex-accent underline"
              >
                En savoir plus
              </Link>
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={() => setExpanded(true)}
              className="rounded-full border border-flex-border px-3 py-1.5 text-xs hover:bg-flex-card"
            >
              Personnaliser
            </button>
            <button
              onClick={rejectAll}
              className="rounded-full border border-flex-border px-3 py-1.5 text-xs hover:bg-flex-card"
            >
              Tout refuser
            </button>
            <button
              onClick={acceptAll}
              className="rounded-full bg-flex-accent px-4 py-1.5 text-xs font-medium text-white hover:brightness-110"
            >
              Tout accepter
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <h3 id="cookie-consent-title" className="font-semibold">
              Préférences cookies
            </h3>
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-flex-muted hover:text-flex-text"
            >
              ← Retour
            </button>
          </div>

          <ToggleRow
            label="Essentiels"
            description="Session utilisateur, mémorisation du consentement, protection CSRF. Indispensables au fonctionnement."
            checked={true}
            disabled
          />
          <ToggleRow
            label="Mesure d'audience"
            description="Statistiques anonymisées via notre PostHog auto-hébergé. Aucun transfert vers un tiers publicitaire."
            checked={analytics}
            onChange={setAnalytics}
          />
          <ToggleRow
            label="Marketing"
            description="Tracking des codes de parrainage et campagnes d'affiliation. Désactivé par défaut."
            checked={marketing}
            onChange={setMarketing}
          />

          <div className="flex items-center justify-end gap-2 border-t border-flex-border pt-4">
            <button
              onClick={rejectAll}
              className="rounded-full border border-flex-border px-3 py-1.5 text-xs hover:bg-flex-card"
            >
              Tout refuser
            </button>
            <button
              onClick={savePreferences}
              className="rounded-full bg-flex-accent px-4 py-1.5 text-xs font-medium text-white hover:brightness-110"
            >
              Enregistrer mes choix
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl bg-flex-card p-3">
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        <p className="mt-1 text-xs text-flex-muted">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer sr-only"
        />
        <div className="h-6 w-11 rounded-full bg-flex-border after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-flex-accent peer-checked:after:translate-x-5 peer-disabled:opacity-60"></div>
      </label>
    </div>
  );
}

/**
 * Read the stored consent. Returns null if the user hasn't decided yet.
 * Used by analytics/marketing bootstrap code to gate themselves.
 */
export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}
