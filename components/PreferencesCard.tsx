"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useTranslation, type Locale } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import type { DmPolicy } from "@/lib/types";

const LANGUAGES: { code: Locale; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
];

const DM_OPTIONS: { value: DmPolicy; label: string; hint: string }[] = [
  {
    value: "everyone",
    label: "Tout le monde",
    hint: "N'importe quel utilisateur peut m'envoyer un message.",
  },
  {
    value: "followers",
    label: "Seulement mes abonnés",
    hint: "Seuls les utilisateurs qui me suivent peuvent me contacter.",
  },
  {
    value: "nobody",
    label: "Personne",
    hint: "Les messages directs sont fermés.",
  },
];

/**
 * Central preferences card. Contains:
 *   - DM policy (DB-backed via /api/me/preferences, enforced in
 *     POST /api/messages).
 *   - Theme (local storage via ThemeProvider).
 *   - Language (cookie-based via useTranslation).
 *
 * These three live here because they actually persist and actually have
 * effect. Anything that isn't enforced is deliberately left out.
 */
export default function PreferencesCard() {
  const { theme, toggleTheme, mounted } = useTheme();
  const { locale, setLocale } = useTranslation();
  const { toast } = useToast();

  const [dmPolicy, setDmPolicy] = useState<DmPolicy>("everyone");
  const [loaded, setLoaded] = useState(false);
  const [savingDm, setSavingDm] = useState(false);

  useEffect(() => {
    fetch("/api/me/preferences", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setDmPolicy(d.preferences?.allowDMs ?? "everyone");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function saveDmPolicy(value: DmPolicy) {
    const previous = dmPolicy;
    setDmPolicy(value);
    setSavingDm(true);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowDMs: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast("success", "Préférence enregistrée");
    } catch (err) {
      setDmPolicy(previous);
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingDm(false);
    }
  }

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema">
      <div className="mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-accent">
          Préférences
        </div>
        <h3 className="text-lg font-bold">Personnalisation</h3>
        <p className="mt-1 text-xs text-flex-muted">
          Tes préférences persistent sur ton compte et s'appliquent à
          l'expérience AIflex.
        </p>
      </div>

      <div className="space-y-5">
        {/* DM policy */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-flex-muted">
            Qui peut m'envoyer un message
          </div>
          <select
            value={dmPolicy}
            onChange={(e) => saveDmPolicy(e.target.value as DmPolicy)}
            disabled={!loaded || savingDm}
            className="w-full rounded-lg border border-flex-border bg-flex-panel px-3 py-2 text-sm"
          >
            {DM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-flex-muted">
            {DM_OPTIONS.find((o) => o.value === dmPolicy)?.hint}
          </p>
        </div>

        {/* Theme */}
        <div className="flex items-center justify-between gap-3 border-t border-flex-border pt-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-flex-muted">
              Thème
            </div>
            <div className="mt-0.5 text-sm font-semibold">
              {mounted
                ? theme === "dark"
                  ? "Sombre"
                  : "Clair"
                : "—"}
            </div>
            <p className="mt-0.5 text-[10px] text-flex-muted">
              Basculer entre clair et sombre. Mémorisé sur cet appareil.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            disabled={!mounted}
            className="shrink-0 rounded-lg bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:bg-flex-border disabled:opacity-50"
          >
            {mounted && theme === "dark" ? "☀ Passer en clair" : "🌙 Passer en sombre"}
          </button>
        </div>

        {/* Language */}
        <div className="border-t border-flex-border pt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-flex-muted">
            Langue de l'interface
          </div>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="w-full rounded-lg border border-flex-border bg-flex-panel px-3 py-2 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-flex-muted">
            Mémorisée dans un cookie et envoyée au serveur.
          </p>
        </div>
      </div>
    </div>
  );
}
