"use client";

import { useState, useEffect } from "react";

export default function TwoFactorCard() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<{
    secret: string;
    otpAuthUri: string;
    backupCodes: string[];
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState("");
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  useEffect(() => {
    fetch("/api/auth/totp")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(d.enabled);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function startSetup() {
    setError("");
    const res = await fetch("/api/auth/totp", { method: "POST" });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setSetupData(data);
  }

  async function confirmSetup() {
    setError("");
    const res = await fetch("/api/auth/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: verifyCode, setup: true }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setEnabled(true);
    setShowBackupCodes(true);
  }

  async function disable2FA() {
    setError("");
    const res = await fetch("/api/auth/totp", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: disableCode }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setEnabled(false);
    setSetupData(null);
    setDisableCode("");
  }

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-flex-text">
          Authentification à deux facteurs (2FA)
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
            enabled
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-flex-border text-flex-muted"
          }`}
        >
          {enabled ? "Activé" : "Désactivé"}
        </span>
      </div>

      {!enabled && !setupData && (
        <>
          <p className="text-xs text-flex-muted mb-3">
            Protège ton compte avec un code temporaire via une application comme
            Google Authenticator ou Authy.
          </p>
          <button
            type="button"
            onClick={startSetup}
            className="rounded-full bg-flex-accent px-5 py-2 text-xs font-bold text-white transition hover:bg-flex-accent/90"
          >
            Activer la 2FA
          </button>
        </>
      )}

      {!enabled && setupData && !showBackupCodes && (
        <div className="space-y-4">
          <p className="text-xs text-flex-muted">
            Scanne ce QR code avec ton application d&apos;authentification, ou entre
            la clé secrète manuellement :
          </p>
          <div className="rounded-xl bg-flex-surface p-4 text-center">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-flex-muted">
              Clé secrète
            </div>
            <code className="text-sm font-mono text-flex-accent break-all">
              {setupData.secret}
            </code>
          </div>
          <div className="rounded-xl bg-flex-surface p-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-flex-muted">
              URI (pour QR code)
            </div>
            <code className="text-[10px] text-flex-muted break-all">
              {setupData.otpAuthUri}
            </code>
          </div>
          <div>
            <label className="block text-xs font-medium text-flex-text mb-1">
              Entre le code à 6 chiffres pour confirmer
            </label>
            <input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              maxLength={6}
              className="w-full rounded-xl bg-flex-surface px-4 py-3 text-center text-lg tracking-[0.3em] font-mono text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            onClick={confirmSetup}
            disabled={verifyCode.length !== 6}
            className="w-full rounded-full bg-flex-accent py-2.5 text-xs font-bold text-white transition hover:bg-flex-accent/90 disabled:opacity-50"
          >
            Confirmer l&apos;activation
          </button>
        </div>
      )}

      {showBackupCodes && setupData && (
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="text-xs font-bold text-amber-400 mb-2">
              Codes de récupération — sauvegarde-les !
            </div>
            <p className="text-[10px] text-flex-muted mb-3">
              Si tu perds accès à ton application, utilise un de ces codes pour te
              connecter. Chaque code ne peut être utilisé qu&apos;une seule fois.
            </p>
            <div className="grid grid-cols-2 gap-1">
              {setupData.backupCodes.map((code) => (
                <code
                  key={code}
                  className="rounded bg-flex-surface px-2 py-1 text-xs font-mono text-flex-text text-center"
                >
                  {code}
                </code>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowBackupCodes(false);
              setSetupData(null);
              setVerifyCode("");
            }}
            className="w-full rounded-full bg-flex-accent py-2 text-xs font-bold text-white transition hover:bg-flex-accent/90"
          >
            J&apos;ai sauvegardé mes codes
          </button>
        </div>
      )}

      {enabled && !showBackupCodes && (
        <div className="space-y-3">
          <p className="text-xs text-flex-muted">
            La 2FA est active. Pour la désactiver, entre un code TOTP ci-dessous.
          </p>
          <input
            type="text"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
            placeholder="Code TOTP pour désactiver"
            maxLength={6}
            className="w-full rounded-xl bg-flex-surface px-4 py-3 text-center text-lg tracking-[0.3em] font-mono text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            onClick={disable2FA}
            disabled={disableCode.length < 6}
            className="w-full rounded-full bg-red-500/20 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/30 disabled:opacity-50"
          >
            Désactiver la 2FA
          </button>
        </div>
      )}
    </div>
  );
}
