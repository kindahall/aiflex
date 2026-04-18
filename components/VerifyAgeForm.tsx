"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  currentLevel: string;
}

export default function VerifyAgeForm({ currentLevel }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  async function submit(level: "self_declared" | "verified") {
    setPending(level);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/me/verify-age", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      if (data.warning) setWarning(data.warning);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <label className="flex items-start gap-3 rounded-2xl bg-flex-card p-4 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-flex-border text-flex-accent"
        />
        <span className="text-flex-muted">
          Je certifie sur l&apos;honneur être majeur(e) au regard de la loi de
          mon pays de résidence et accepter de fournir des informations
          véridiques.
        </span>
      </label>

      {warning && (
        <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          ⚠️ {warning}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => submit("self_declared")}
          disabled={!confirmed || pending !== null}
          className="rounded-2xl border border-flex-border bg-flex-card p-4 text-left transition hover:border-flex-accent/50 disabled:opacity-50"
        >
          <div className="text-2xl">🟡</div>
          <div className="mt-2 font-medium">Niveau 1 — Auto-déclaration</div>
          <div className="mt-1 text-sm text-flex-muted">
            Suffisant pour la majorité des contenus adultes (sauf marchés
            UK / Texas qui imposent le niveau 2).
          </div>
          <div className="mt-2 text-xs text-flex-accent">
            {pending === "self_declared" ? "Enregistrement…" : "Activer →"}
          </div>
        </button>

        <button
          onClick={() => submit("verified")}
          disabled={!confirmed || pending !== null || currentLevel === "verified"}
          className="rounded-2xl border border-flex-accent/50 bg-flex-accent/5 p-4 text-left transition hover:bg-flex-accent/10 disabled:opacity-50"
        >
          <div className="text-2xl">✓</div>
          <div className="mt-2 font-medium">Niveau 2 — KYC Yoti</div>
          <div className="mt-1 text-sm text-flex-muted">
            Vérification rapide via Yoti (30 sec). Aucune copie de tes
            documents conservée chez AIflex.
          </div>
          <div className="mt-2 text-xs text-flex-accent">
            {pending === "verified"
              ? "Connexion Yoti…"
              : currentLevel === "verified"
                ? "Déjà vérifié"
                : "Vérifier →"}
          </div>
        </button>
      </div>
    </div>
  );
}
