"use client";

import { useState } from "react";

interface Profile {
  id: string;
  name: string;
  isChild: boolean;
  ageRating: "kids" | "teens" | "all" | "adult";
  curfewHour: number | null;
  hasPin: boolean;
}

interface Props {
  profile: Profile;
}

const RATINGS: Array<{ id: Profile["ageRating"]; label: string }> = [
  { id: "kids", label: "Kids (≤ 7 ans)" },
  { id: "teens", label: "Teens (≤ 13 ans)" },
  { id: "all", label: "Tout public" },
  { id: "adult", label: "Adulte (vérification d'âge requise)" },
];

export default function ParentalSettingsForm({ profile }: Props) {
  const [isChild, setIsChild] = useState(profile.isChild);
  const [ageRating, setAgeRating] = useState<Profile["ageRating"]>(profile.ageRating);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [hasPin, setHasPin] = useState(profile.hasPin);
  const [curfewHour, setCurfewHour] = useState<number | null>(profile.curfewHour);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    let pinPayload: string | null | undefined;
    if (pin) {
      if (pin !== confirmPin) {
        setError("Les deux PIN ne correspondent pas.");
        return;
      }
      if (!/^\d{4,8}$/.test(pin)) {
        setError("Le PIN doit contenir entre 4 et 8 chiffres.");
        return;
      }
      pinPayload = pin;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/profiles/${profile.id}/parental`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isChild,
          ageRating,
          curfewHour,
          ...(pinPayload !== undefined ? { pin: pinPayload } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setHasPin(Boolean(data.profile.hasPin));
      setPin("");
      setConfirmPin("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  async function clearPin() {
    if (!confirm("Supprimer le PIN du profil ?")) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profile.id}/parental`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }
      setHasPin(false);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6 rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema sm:p-8">
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={isChild}
            onChange={(e) => setIsChild(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-flex-border text-flex-accent"
          />
          <span>
            <strong className="block">Profil Kids</strong>
            <span className="text-flex-muted">
              Filtre automatiquement le catalogue selon l&apos;âge et active la
              sortie protégée par PIN.
            </span>
          </span>
        </label>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
          Rating maximum visible
        </label>
        <select
          value={ageRating}
          onChange={(e) => setAgeRating(e.target.value as Profile["ageRating"])}
          className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
        >
          {RATINGS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
          Couvre-feu (heure de blocage de la lecture)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="23"
            value={curfewHour ?? 0}
            onChange={(e) => setCurfewHour(Number(e.target.value))}
            disabled={curfewHour == null}
            className="flex-1"
          />
          <span className="w-20 rounded-lg bg-flex-card px-2 py-1 text-center text-sm font-medium">
            {curfewHour == null ? "—" : `${curfewHour}h`}
          </span>
          <button
            type="button"
            onClick={() => setCurfewHour(curfewHour == null ? 21 : null)}
            className="rounded-full border border-flex-border px-3 py-1 text-xs hover:bg-flex-card"
          >
            {curfewHour == null ? "Activer" : "Désactiver"}
          </button>
        </div>
        <p className="mt-1 text-xs text-flex-muted">
          Lecture bloquée entre l&apos;heure choisie et 06h00 le lendemain.
        </p>
      </div>

      <div className="rounded-2xl bg-flex-card p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">PIN de sortie (4-8 chiffres)</h3>
          {hasPin && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              ✓ PIN actif
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-flex-muted">
          Demandé pour quitter ce profil vers un profil adulte. Stocké hashé.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            placeholder={hasPin ? "Nouveau PIN" : "PIN"}
            className="rounded-xl border border-flex-border bg-flex-surface px-3 py-2 text-center tracking-widest"
          />
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            placeholder="Confirmer"
            className="rounded-xl border border-flex-border bg-flex-surface px-3 py-2 text-center tracking-widest"
          />
        </div>
        {hasPin && (
          <button
            type="button"
            onClick={clearPin}
            className="mt-3 text-xs text-red-400 hover:underline"
          >
            Supprimer le PIN
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          ✓ Sauvegardé
        </div>
      )}

      <div className="flex justify-end border-t border-flex-border pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-flex-accent px-6 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Sauvegarde…" : "Sauvegarder"}
        </button>
      </div>
    </form>
  );
}
