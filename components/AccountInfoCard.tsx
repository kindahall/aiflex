"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";
import type { User } from "@/lib/types";

type ExtendedUser = User & {
  oauthProvider?: "google" | "github" | "apple";
  totpEnabled?: boolean;
};

const PLAN_LABEL: Record<string, string> = {
  free: "Gratuit",
  pro: "Pro",
  studio: "Studio",
};

function formatDate(ms?: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function authMethodLabel(u: ExtendedUser): string {
  if (u.oauthProvider === "google") return "Google";
  if (u.oauthProvider === "github") return "GitHub";
  if (u.oauthProvider === "apple") return "Apple";
  return "Email + mot de passe";
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function seedToColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 45%)`;
}

/**
 * Read-only overview card of the user's account identity, plan, and auth
 * details. Only interactive action is "Régénérer avatar".
 */
export default function AccountInfoCard() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const u = user as ExtendedUser;
  const seed = u.avatarSeed || u.email || u.id;
  const plan = (u.plan as string) || "free";
  const verified = Boolean(u.emailVerified);

  async function regenerateAvatar() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerateAvatar: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      await refresh();
      toast("success", "Avatar régénéré");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema">
      <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-flex-accent">
        Mon compte
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div
            className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-black text-white shadow-cinema ring-4 ring-flex-border"
            style={{ backgroundColor: seedToColor(seed) }}
            aria-label="Avatar"
          >
            {initialsFrom(u.name)}
          </div>
          <button
            type="button"
            onClick={regenerateAvatar}
            disabled={busy}
            className="rounded-lg bg-flex-panel px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-flex-text transition hover:bg-flex-border disabled:opacity-50"
          >
            {busy ? "…" : "↻ Régénérer"}
          </button>
        </div>

        <dl className="grid flex-1 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <InfoRow label="Nom">
            <span className="font-semibold">{u.name}</span>
          </InfoRow>
          <InfoRow label="Email">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{u.email}</span>
              {verified ? (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                  ✓ Vérifié
                </span>
              ) : (
                <span className="rounded-full bg-flex-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-flex-accent">
                  ⚠ Non vérifié
                </span>
              )}
            </div>
          </InfoRow>
          <InfoRow label="Rôle">
            <span className="font-semibold capitalize">
              {u.role === "admin" ? "Administrateur" : "Utilisateur"}
            </span>
          </InfoRow>
          <InfoRow label="Plan">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {PLAN_LABEL[plan] || plan}
              </span>
              {u.planExpiresAt && (
                <span className="text-[10px] text-flex-muted">
                  · expire le {formatDate(u.planExpiresAt)}
                </span>
              )}
            </div>
          </InfoRow>
          <InfoRow label="Méthode d'authentification">
            <span className="font-semibold">{authMethodLabel(u)}</span>
          </InfoRow>
          <InfoRow label="2FA">
            <span className="font-semibold">
              {u.totpEnabled ? "Activé" : "Désactivé"}
            </span>
          </InfoRow>
          <InfoRow label="Compte créé le">
            <span className="font-semibold">{formatDate(u.createdAt)}</span>
          </InfoRow>
          <InfoRow label="ID">
            <code className="font-mono text-[11px] text-flex-muted">
              {u.id}
            </code>
          </InfoRow>
        </dl>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-flex-text">{children}</dd>
    </div>
  );
}
