"use client";

import { useState, useEffect } from "react";

const RATINGS = [
  { value: "G", label: "G — Tout public", description: "Contenu familial" },
  { value: "PG", label: "PG — Guidance parentale", description: "Certains contenus peuvent ne pas convenir aux jeunes enfants" },
  { value: "PG-13", label: "PG-13 — 13 ans+", description: "Certains contenus peuvent ne pas convenir aux moins de 13 ans" },
  { value: "R", label: "R — Tout contenu", description: "Aucune restriction" },
];

export default function ParentalControlCard() {
  const [enabled, setEnabled] = useState(false);
  const [maxRating, setMaxRating] = useState("R");
  const [pin, setPin] = useState("");
  const [verifyPin, setVerifyPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/parental")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(d.enabled);
        setMaxRating(d.maxRating || "R");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleEnable() {
    if (!pin || pin.length < 4) {
      setError("Le PIN doit contenir 4 à 6 chiffres");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/parental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, maxRating }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setEnabled(true);
        setSuccess("Contrôle parental activé");
        setPin("");
        setTimeout(() => setSuccess(""), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    if (!verifyPin) {
      setError("Entre ton PIN pour désactiver");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/parental", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: verifyPin }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setEnabled(false);
        setSuccess("Contrôle parental désactivé");
        setVerifyPin("");
        setTimeout(() => setSuccess(""), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-flex-text">Contrôle parental</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
            enabled
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-flex-border text-flex-muted"
          }`}
        >
          {enabled ? `Actif — ${maxRating}` : "Désactivé"}
        </span>
      </div>

      {success && (
        <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-400">
          {success}
        </div>
      )}

      {!enabled ? (
        <div className="space-y-3">
          <p className="text-xs text-flex-muted">
            Restreins le contenu visible selon le rating. Un PIN sera requis pour
            accéder au contenu au-delà du niveau choisi.
          </p>
          <div>
            <label className="block text-xs font-medium text-flex-text mb-1">
              Rating maximum autorisé
            </label>
            <select
              value={maxRating}
              onChange={(e) => setMaxRating(e.target.value)}
              className="w-full"
            >
              {RATINGS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-flex-text mb-1">
              PIN parental (4-6 chiffres)
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••"
              maxLength={6}
              inputMode="numeric"
              className="w-full rounded-xl bg-flex-surface px-4 py-3 text-center text-lg tracking-[0.3em] text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleEnable}
            disabled={saving || pin.length < 4}
            className="w-full rounded-full bg-flex-accent py-2.5 text-xs font-bold text-white transition hover:bg-flex-accent/90 disabled:opacity-50"
          >
            {saving ? "Activation..." : "Activer le contrôle parental"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-flex-muted">
            Le contenu est restreint au rating <strong>{maxRating}</strong>.
            Entre ton PIN pour désactiver.
          </p>
          <input
            type="password"
            value={verifyPin}
            onChange={(e) => setVerifyPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="PIN parental"
            maxLength={6}
            inputMode="numeric"
            className="w-full rounded-xl bg-flex-surface px-4 py-3 text-center text-lg tracking-[0.3em] text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleDisable}
            disabled={saving || verifyPin.length < 4}
            className="w-full rounded-full bg-red-500/20 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/30 disabled:opacity-50"
          >
            {saving ? "Désactivation..." : "Désactiver le contrôle parental"}
          </button>
        </div>
      )}
    </div>
  );
}
