"use client";

import { useToast } from "@/components/Toast";

/**
 * RGPD self-service data export. Triggers a JSON download of the user's
 * account, projects, watchlist, and notifications. No parameters.
 */
export default function ExportDataCard() {
  const { toast } = useToast();

  function download() {
    try {
      // Simple anchor click — the API sets Content-Disposition: attachment.
      window.location.href = "/api/me/export";
      toast("success", "Téléchargement lancé");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
        Mes données
      </div>
      <h3 className="mb-1 text-lg font-bold">Exporter mes données</h3>
      <p className="mb-4 text-xs text-flex-muted">
        Télécharge un fichier JSON avec ton compte, tes projets, ta watchlist
        et tes notifications (RGPD). Les secrets (2FA, PIN parental, mot de
        passe) sont exclus.
      </p>
      <button
        type="button"
        onClick={download}
        className="rounded-lg bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:bg-flex-border"
      >
        ⬇ Télécharger
      </button>
    </div>
  );
}
