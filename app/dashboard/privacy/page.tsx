"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

type ConsentType =
  | "cgu"
  | "privacy"
  | "cookies_analytics"
  | "cookies_marketing"
  | "newsletter";

interface ConsentRecord {
  id: string;
  type: ConsentType;
  version: string;
  accepted: boolean;
  createdAt: string;
}

/**
 * RGPD privacy hub (V8 §19.7).
 * Consolidates: data export, account deletion, marketing opt-in/out, consent
 * history, cookie preferences, and shortcut links to the legal documents.
 */
export default function PrivacyPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [exportPending, setExportPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/me/consents", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setConsents(j.consents ?? []))
      .catch(() => setConsents([]));
  }, [user]);

  if (loading) {
    return (
      <CenteredMessage>Chargement…</CenteredMessage>
    );
  }
  if (!user) {
    return (
      <CenteredMessage>
        Connecte-toi.{" "}
        <Link href="/login?redirect=/dashboard/privacy" className="text-flex-accent underline">
          Se connecter
        </Link>
      </CenteredMessage>
    );
  }

  async function handleExport() {
    setExportPending(true);
    try {
      const res = await fetch("/api/me/export");
      if (!res.ok) throw new Error(`Export impossible (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aiflex-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setExportPending(false);
    }
  }

  async function setCookieConsent(type: ConsentType, accepted: boolean) {
    await fetch("/api/me/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, version: "1", accepted }),
    });
    const r = await fetch("/api/me/consents", { cache: "no-store" });
    const j = await r.json();
    setConsents(j.consents ?? []);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-10 animate-fadeUp">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
        >
          ← Retour au dashboard
        </Link>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          RGPD
        </div>
        <h1 className="font-display text-4xl font-bold">Ta vie privée</h1>
        <p className="mt-2 max-w-2xl text-flex-muted">
          Ton centre de contrôle des droits RGPD : accès, rectification,
          portabilité, effacement, consentements.
        </p>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="📦 Exporter mes données"
            description="Télécharge un fichier JSON avec tout ce qu'AiFlex a enregistré sur toi : profil, projets, vues, commentaires, paiements créateur, consentements, etc. Art. 20 RGPD (droit à la portabilité)."
          />
          <button
            onClick={handleExport}
            disabled={exportPending}
            className="rounded-full bg-flex-accent px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {exportPending ? "Préparation…" : "Télécharger mes données"}
          </button>
        </Card>

        <Card>
          <CardHeader
            title="🍪 Cookies et traceurs"
            description="Tu peux activer ou désactiver chaque catégorie à tout moment. Les cookies essentiels (session, consentement) ne peuvent pas être désactivés."
          />
          <div className="space-y-3">
            <CookieRow
              label="Mesure d'audience (PostHog auto-hébergé)"
              lastDecision={latestFor(consents, "cookies_analytics")}
              onAccept={() => setCookieConsent("cookies_analytics", true)}
              onReject={() => setCookieConsent("cookies_analytics", false)}
            />
            <CookieRow
              label="Marketing (parrainage / affiliation)"
              lastDecision={latestFor(consents, "cookies_marketing")}
              onAccept={() => setCookieConsent("cookies_marketing", true)}
              onReject={() => setCookieConsent("cookies_marketing", false)}
            />
            <CookieRow
              label="Newsletter produits et nouveautés"
              lastDecision={latestFor(consents, "newsletter")}
              onAccept={() => setCookieConsent("newsletter", true)}
              onReject={() => setCookieConsent("newsletter", false)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="📜 Historique des consentements"
            description="Chaque décision prise est horodatée. Art. 7.1 RGPD — obligation de démontrer le consentement."
          />
          {consents.length === 0 ? (
            <p className="text-sm text-flex-muted">Aucun consentement enregistré.</p>
          ) : (
            <ul className="divide-y divide-flex-border text-sm">
              {consents.slice(0, 30).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-2">
                  <div>
                    <span className="font-medium">{labelForConsent(c.type)}</span>
                    <span className="ml-2 text-xs text-flex-muted">v{c.version}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.accepted
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-flex-card text-flex-muted"
                      }`}
                    >
                      {c.accepted ? "Accepté" : "Refusé"}
                    </span>
                    <time className="text-xs text-flex-muted">
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(c.createdAt))}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="⚖️ Documents juridiques"
            description="Version en vigueur des documents que tu as signés."
          />
          <div className="flex flex-wrap gap-2">
            <LegalLink href="/legal/terms">CGU</LegalLink>
            <LegalLink href="/legal/privacy">Confidentialité</LegalLink>
            <LegalLink href="/legal/cookies">Cookies</LegalLink>
            <LegalLink href="/legal/creator-terms">CGU créateurs</LegalLink>
            <LegalLink href="/legal/cgv">CGV</LegalLink>
            <LegalLink href="/legal/dmca">DMCA</LegalLink>
          </div>
        </Card>

        <Card tone="danger">
          <CardHeader
            title="🗑️ Supprimer mon compte"
            description="Suppression définitive — 30 jours de rétention pour revenir en arrière, puis effacement total (art. 17 RGPD — droit à l'effacement). Les paiements et logs financiers sont conservés 10 ans pour obligations comptables."
          />
          {!deleteOpen ? (
            <button
              onClick={() => setDeleteOpen(true)}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20"
            >
              Supprimer mon compte
            </button>
          ) : (
            <DeleteForm onCancel={() => setDeleteOpen(false)} onDone={() => router.push("/")} />
          )}
        </Card>

        <p className="text-center text-xs text-flex-muted">
          Pour tout exercice de droits RGPD non couvert ci-dessus, écris à{" "}
          <a href="mailto:dpo@aiflex.com" className="text-flex-accent underline">
            dpo@aiflex.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UI bits
// ---------------------------------------------------------------------------

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-flex-muted">
      {children}
    </div>
  );
}

function Card({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const border = tone === "danger" ? "border-red-500/30" : "border-flex-border";
  return (
    <section className={`rounded-3xl border ${border} bg-flex-panel p-6 shadow-cinema sm:p-8`}>
      {children}
    </section>
  );
}

function CardHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-5">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-flex-muted">{description}</p>
    </header>
  );
}

function LegalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-full border border-flex-border px-3 py-1.5 text-xs text-flex-text hover:border-flex-accent hover:bg-flex-card"
    >
      {children}
    </Link>
  );
}

function CookieRow({
  label,
  lastDecision,
  onAccept,
  onReject,
}: {
  label: string;
  lastDecision: ConsentRecord | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  const accepted = lastDecision?.accepted === true;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-flex-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-medium">{label}</div>
        {lastDecision && (
          <div className="mt-0.5 text-xs text-flex-muted">
            Dernière décision :{" "}
            {new Intl.DateTimeFormat("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(lastDecision.createdAt))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onReject}
          className={`rounded-full border px-3 py-1.5 text-xs transition ${
            lastDecision && !accepted
              ? "border-flex-text bg-flex-text/10 text-flex-text"
              : "border-flex-border hover:bg-flex-panel"
          }`}
        >
          Refuser
        </button>
        <button
          onClick={onAccept}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            accepted
              ? "bg-flex-accent text-white"
              : "border border-flex-border hover:bg-flex-panel"
          }`}
        >
          Accepter
        </button>
      </div>
    </div>
  );
}

function DeleteForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: password,
          confirmation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suppression impossible");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-flex-muted">
          Mot de passe actuel
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-flex-muted">
          Tape <code className="rounded bg-flex-card px-1.5 py-0.5">SUPPRIMER</code> pour confirmer
        </label>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
          placeholder="SUPPRIMER"
          className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        />
      </div>
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-xs text-flex-muted hover:text-flex-text"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={pending || confirmation !== "SUPPRIMER"}
          className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Suppression…" : "Supprimer définitivement"}
        </button>
      </div>
    </form>
  );
}

function labelForConsent(type: ConsentType): string {
  switch (type) {
    case "cgu":
      return "CGU";
    case "privacy":
      return "Politique de confidentialité";
    case "cookies_analytics":
      return "Cookies analytics";
    case "cookies_marketing":
      return "Cookies marketing";
    case "newsletter":
      return "Newsletter";
  }
}

function latestFor(list: ConsentRecord[], type: ConsentType): ConsentRecord | null {
  return list.find((c) => c.type === type) ?? null;
}
