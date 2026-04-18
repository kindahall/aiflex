"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

const CONFIRMATION_WORD = "SUPPRIMER";

/**
 * Zone de danger — suppression définitive du compte. Double confirmation :
 * mot de passe courant + saisie de "SUPPRIMER". Côté serveur, les données
 * du user (projets, likes, etc.) sont effacées en cascade.
 */
export default function DeleteAccountCard() {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<null | {
    type: "ok" | "err";
    msg: string;
  }>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (
      !confirm(
        "Dernière confirmation : ton compte, tes projets et toutes tes données seront supprimés définitivement. Continuer ?"
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, confirmation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast("success", "Compte supprimé");
      if (data.hadSubscription) {
        alert(
          "Ton abonnement Stripe reste actif tant que tu ne l'annules pas via la facturation. Pense à le faire."
        );
      }
      window.dispatchEvent(new Event("aiflex:auth-changed"));
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setStatus({ type: "err", msg });
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-6 shadow-cinema">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-red-400">
        Zone de danger
      </div>
      <h3 className="mb-1 text-lg font-bold text-red-200">Supprimer mon compte</h3>
      <p className="mb-4 text-xs text-flex-muted">
        Action <strong>définitive</strong>. Tes projets, publications, likes,
        watchlist, commentaires et notifications seront effacés. L'email et
        les données de ton compte ne seront pas récupérables.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-red-500/50 bg-transparent px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-300 transition hover:bg-red-500/10"
        >
          Supprimer mon compte
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 animate-fadeUp">
          <div>
            <label htmlFor="del-password">Mot de passe actuel</label>
            <input
              id="del-password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label htmlFor="del-confirm">
              Pour confirmer, tape <strong>{CONFIRMATION_WORD}</strong>
            </label>
            <input
              id="del-confirm"
              type="text"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </div>
          {status && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              ⚠ {status.msg}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || confirmation !== CONFIRMATION_WORD}
              className="rounded-lg bg-red-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCurrentPassword("");
                setConfirmation("");
                setStatus(null);
              }}
              disabled={busy}
              className="rounded-lg bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:bg-flex-border disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
