"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * Collapsible self-service password change card.
 * Drop into any authenticated page — posts to /api/auth/change-password.
 */
export default function ChangePasswordCard() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<null | {
    type: "ok" | "err";
    msg: string;
  }>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (newPassword !== confirmPassword) {
      setStatus({
        type: "err",
        msg: "Les deux mots de passe ne correspondent pas.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setStatus({ type: "ok", msg: "Mot de passe mis à jour." });
      toast("success", "Mot de passe modifié");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setStatus({ type: "err", msg });
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
            Sécurité du compte
          </div>
          <div className="text-base font-bold">Changer mon mot de passe</div>
        </div>
        <span className="text-flex-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3 animate-fadeUp">
          <div>
            <label htmlFor="dash-current">Mot de passe actuel</label>
            <input
              id="dash-current"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label htmlFor="dash-new">Nouveau mot de passe</label>
            <input
              id="dash-new"
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="dash-confirm">Confirmation</label>
            <input
              id="dash-confirm"
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {status && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                status.type === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-red-500/30 bg-red-500/10 text-red-200"
              }`}
            >
              {status.type === "ok" ? "✓ " : "⚠ "}
              {status.msg}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-flex-accent py-2.5 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Mise à jour…" : "Mettre à jour"}
          </button>
        </form>
      )}
    </div>
  );
}
