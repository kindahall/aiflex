"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AnimatedNumber from "@/components/AnimatedNumber";
import { useToast } from "@/components/Toast";
import LoadingPulse from "@/components/LoadingPulse";
import ChangePasswordCard from "@/components/ChangePasswordCard";
import ProfileEditCard from "@/components/ProfileEditCard";
import TwoFactorCard from "@/components/TwoFactorCard";
import ParentalControlCard from "@/components/ParentalControlCard";
import AccountInfoCard from "@/components/AccountInfoCard";
import ChangeEmailCard from "@/components/ChangeEmailCard";
import SessionsCard from "@/components/SessionsCard";
import ExportDataCard from "@/components/ExportDataCard";
import DeleteAccountCard from "@/components/DeleteAccountCard";
import ProfilesCard from "@/components/ProfilesCard";
import WatchlistCard from "@/components/WatchlistCard";
import InboxCard from "@/components/InboxCard";
import CollaborationsCard from "@/components/CollaborationsCard";
import TipsStatsCard from "@/components/TipsStatsCard";
import PreferencesCard from "@/components/PreferencesCard";
import { useAuth } from "@/lib/useAuth";
import { useTranslation } from "@/lib/i18n";
import type { Project, Visibility } from "@/lib/types";

const STAGE_LABEL: Record<Project["stage"], string> = {
  idea: "Idée",
  concept: "Concept",
  scenario: "Scénario",
  scenes: "Scènes",
  visuals: "Visuels IA",
  assembly: "Assemblage",
  published: "Publié",
};

interface UsageState {
  videosGenerated: number;
  quota: number;
  unlimited: boolean;
  remaining: number | null;
}

export default function DashboardPage() {
  const { user, loading, isAdminView } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [community, setCommunity] = useState<{
    followers: number;
    following: number;
    totalLikes: number;
    totalViews: number;
    totalComments: number;
    unreadMessages: number;
  } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login?next=/dashboard");
  }, [loading, user, router]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setProjects(data.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchProjects();
  }, [user, fetchProjects]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/me/usage", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setUsage(d);
      })
      .catch(() => toast("error", "Erreur chargement quota"));

    // Fetch community stats
    Promise.all([
      fetch(`/api/users/${user.id}/followers`).then((r) => r.json()),
      fetch(`/api/users/${user.id}/following`).then((r) => r.json()),
      fetch("/api/messages").then((r) => r.json()),
    ])
      .then(([followersData, followingData, messagesData]) => {
        setCommunity({
          followers: followersData.followers?.length ?? 0,
          following: followingData.following?.length ?? 0,
          totalLikes: 0, // Will be computed from projects below
          totalViews: 0,
          totalComments: 0,
          unreadMessages: messagesData.unread ?? 0,
        });
      })
      .catch(() => {});
  }, [user, toast]);

  const [resendStatus, setResendStatus] = useState<
    null | { type: "ok" | "err"; msg: string }
  >(null);
  const [resending, setResending] = useState(false);

  async function resendVerification() {
    setResending(true);
    setResendStatus(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setResendStatus({
        type: "ok",
        msg: "Email envoyé. Pense à vérifier tes spams.",
      });
    } catch (e) {
      setResendStatus({
        type: "err",
        msg: e instanceof Error ? e.message : "Erreur",
      });
    } finally {
      setResending(false);
    }
  }

  async function setVisibility(project: Project, visibility: Visibility) {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/publish`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      await fetchProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce projet définitivement ?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    await fetchProjects();
  }

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20">
        <LoadingPulse label="Chargement du dashboard" />
      </div>
    );
  }

  const publicCount = projects.filter(
    (p) => p.published && p.visibility === "public"
  ).length;
  const totalVideos = projects.reduce(
    (n, p) => n + (p.scenes?.filter((s) => s.videoUrl).length || 0),
    0
  );
  const totalLikes = projects.reduce((n, p) => n + (p.likes || 0), 0);
  const totalViews = projects.reduce((n, p) => n + (p.views || 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-full bg-flex-accent/20 blur-[80px] pointer-events-none" />
          <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.3em] text-flex-accent backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulseGlow rounded-full bg-flex-accent shadow-sm" />
            {t("dashboard.title")}
          </div>
          <h1 className="mt-4 text-5xl font-black tracking-tight hologram-text">
            {t("dashboard.greeting", { name: user.name })}
          </h1>
          <p className="mt-2 text-base text-flex-muted">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <Link
          href="/studio"
          className="relative overflow-hidden rounded-xl bg-gradient-to-r from-flex-accent to-flex-accent2 px-8 py-4 text-sm font-bold uppercase tracking-widest text-white shadow-glow transition-all hover:scale-105 hover:shadow-glowSm inner-glow group"
        >
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite_linear] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          <span className="relative z-10 flex items-center gap-2">
            + {t("dashboard.newFilm")}
          </span>
        </Link>
      </div>

      {/* Email verification banner — visible until the user has clicked
          the link from their inbox. Admins are exempt (auto-verified at
          seed). */}
      {user.role !== "admin" &&
        !(user as { emailVerified?: boolean }).emailVerified && (
          <div className="mb-8 rounded-2xl border border-flex-accent/40 bg-flex-accent/10 p-5">
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent">
              ✉ Vérification requise
            </div>
            <div className="mb-2 text-lg font-bold">
              Confirme ton adresse email
            </div>
            <p className="mb-3 text-sm text-flex-muted">
              On t&apos;a envoyé un lien à <strong>{user.email}</strong>.
              Tu pourras créer des films librement, mais la{" "}
              <strong>publication est bloquée</strong> tant que ton
              adresse n&apos;est pas vérifiée.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending}
                className="rounded-lg bg-flex-text px-4 py-2 text-xs font-bold text-flex-bg transition hover:opacity-90 disabled:opacity-50"
              >
                {resending ? "Envoi…" : "↻ Renvoyer le lien"}
              </button>
              {resendStatus && (
                <span
                  className={`text-xs ${
                    resendStatus.type === "ok"
                      ? "text-emerald-300"
                      : "text-red-300"
                  }`}
                >
                  {resendStatus.type === "ok" ? "✓ " : "⚠ "}
                  {resendStatus.msg}
                </span>
              )}
            </div>
          </div>
        )}

      {/* Account overview — identity, plan, auth method, creation date */}
      <AccountInfoCard />

      {/* Stats */}
      <div className="mb-10 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label={t("dashboard.projects")} value={projects.length.toString()} />
        <StatCard label={t("dashboard.published")} value={publicCount.toString()} />
        <StatCard label={t("dashboard.videosGenerated")} value={totalVideos.toString()} />
        <QuotaCard usage={usage} isAdmin={isAdminView} />
      </div>

      {/* Community stats */}
      <div className="mb-10">
        <div className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
          {t("dashboard.community")}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label={`♥ ${t("dashboard.likesReceived")}`} value={totalLikes.toString()} accent />
          <StatCard label={`👁 ${t("dashboard.totalViews")}`} value={totalViews.toString()} />
          <StatCard
            label={t("dashboard.subscribers")}
            value={(community?.followers ?? 0).toString()}
          />
          <StatCard
            label={t("dashboard.subscriptions")}
            value={(community?.following ?? 0).toString()}
          />
          <StatCard
            label={t("dashboard.messages")}
            value={(community?.unreadMessages ?? 0).toString()}
          />
          <div className="glass-panel rounded-[1.5rem] p-5 shadow-obsidian transition-transform hover:scale-[1.02] animated-border">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
              {t("dashboard.myProfile")}
            </div>
            <Link
              href={`/u/${user.id}`}
              className="text-sm font-bold text-flex-accent hover:underline"
            >
              {t("dashboard.viewProfile")}
            </Link>
          </div>
        </div>
      </div>

      {isAdminView && (
        <div className="mb-8 rounded-2xl border border-flex-accent2/40 bg-flex-accent/10 p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent2">
            Accès administrateur
          </div>
          <div className="mb-2 text-lg font-bold">
            Tu gères la plateforme AIflex
          </div>
          <p className="mb-3 text-sm text-flex-muted">
            Surveille les comptes, modère les projets, configure les modèles
            IA depuis le panneau d'administration.
          </p>
          <Link
            href="/admin"
            className="inline-block rounded-lg bg-flex-text px-4 py-2 text-xs font-bold text-black transition hover:bg-white"
          >
            Ouvrir le panneau admin →
          </Link>
        </div>
      )}

      <h2 className="mb-6 text-3xl font-black text-flex-text hologram-text">Mes projets</h2>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          ⚠ {error}
        </div>
      )}

      {loadingProjects ? (
        <LoadingPulse label="Chargement des projets" />
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-12 text-center">
          <div className="mb-3 text-5xl">🎬</div>
          <h3 className="mb-2 text-xl font-bold">Pas encore de projet</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-flex-muted">
            Lance ton premier film dans le Studio IA.
          </p>
          <Link
            href="/studio"
            className="inline-block rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold text-white"
          >
            + Créer un film
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => {
            const isPublic =
              p.published && p.visibility === "public";
            const canPublish =
              Boolean(p.concept) && Boolean(p.scenes?.length);
            return (
              <div
                key={p.id}
                className="group flex flex-wrap items-center gap-5 rounded-[1.5rem] border border-white/5 bg-flex-card/60 backdrop-blur-xl p-4 shadow-obsidian transition-all hover:scale-[1.01] hover:border-flex-accent/50 hover:shadow-glowSm"
              >
                <div
                  className="relative h-28 w-44 shrink-0 overflow-hidden rounded-xl bg-cover bg-center shadow-inner"
                  style={{
                    backgroundImage: `url(${
                      p.scenes?.[0]?.imageUrl ||
                      `https://picsum.photos/seed/${p.id}/640/360`
                    })`,
                  }}
                >
                  <div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-transparent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-flex-accent2/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-flex-accent2">
                      {STAGE_LABEL[p.stage]}
                    </span>
                    {isPublic ? (
                      <span className="rounded-full bg-flex-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-flex-accent">
                        ● Public
                      </span>
                    ) : (
                      <span className="rounded-full bg-flex-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-flex-muted">
                        ⎚ Privé
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-flex-muted">
                      {p.genre} · {p.format}
                    </span>
                  </div>
                  <h3 className="truncate text-xl font-bold">
                    {p.concept?.title || "Projet sans titre"}
                  </h3>
                  <p className="mt-0.5 line-clamp-1 text-xs text-flex-muted">
                    {p.concept?.logline || p.idea}
                  </p>
                  {p.scenes && p.scenes.length > 0 && (
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-flex-muted">
                      <span>{p.scenes.length} scènes</span>
                      <span>·</span>
                      <span className="text-flex-accent">
                        {p.scenes.filter((s) => s.videoUrl).length} vidéos IA
                      </span>
                      {isPublic && (
                        <>
                          <span>·</span>
                          <span>
                            👁 {p.views || 0} · ♥ {p.likes || 0}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canPublish && !isPublic && (
                    <button
                      type="button"
                      onClick={() => setVisibility(p, "public")}
                      className="rounded-lg bg-flex-accent px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
                    >
                      ⬆ Publier
                    </button>
                  )}
                  {isPublic && (
                    <button
                      type="button"
                      onClick={() => setVisibility(p, "private")}
                      className="rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
                    >
                      ⎚ Rendre privé
                    </button>
                  )}
                  <Link
                    href={`/studio/${p.id}`}
                    className="rounded-lg bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:bg-flex-border"
                  >
                    Ouvrir →
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="rounded-lg border border-flex-border bg-flex-panel px-3 py-2 text-xs text-flex-muted transition hover:border-red-500/50 hover:text-red-400"
                    aria-label="Supprimer"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mt-16 mb-6 text-2xl font-black text-flex-text">
        Mon activité
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <WatchlistCard />
        <InboxCard />
        <ProfilesCard />
        <TipsStatsCard />
      </div>
      <div className="mt-6">
        <CollaborationsCard />
      </div>

      <h2 className="mt-16 mb-6 text-2xl font-black text-flex-text">
        Paramètres du compte
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <ProfileEditCard />
        <ChangeEmailCard />
        <ChangePasswordCard />
        <TwoFactorCard />
        <ParentalControlCard />
        <PreferencesCard />
      </div>

      <h2 className="mt-16 mb-6 text-2xl font-black text-flex-text">
        Sécurité &amp; données
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <SessionsCard />
        <ExportDataCard />
      </div>

      <h2 className="mt-16 mb-6 text-2xl font-black text-red-300">
        Zone de danger
      </h2>
      <DeleteAccountCard />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const num = parseInt(value, 10);
  const isNumber = !isNaN(num);

  return (
    <div
      className={`glass-panel rounded-[1.5rem] p-6 shadow-obsidian transition-transform hover:scale-[1.03] ${
        accent
          ? "border-flex-accent/40 bg-flex-accent/10 ambient-glow"
          : ""
      }`}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
        {label}
      </div>
      <div className="text-3xl font-black tracking-tight">
        {isNumber ? <AnimatedNumber value={num} /> : value}
      </div>
    </div>
  );
}

function QuotaCard({
  usage,
  isAdmin,
}: {
  usage: UsageState | null;
  isAdmin: boolean;
}) {
  if (!usage) {
    return (
      <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
          Quota vidéo (mois)
        </div>
        <div className="text-3xl font-black tracking-tight text-flex-muted">
          —
        </div>
      </div>
    );
  }
  if (isAdmin || usage.unlimited || !usage.quota) {
    return (
      <div className="rounded-2xl border border-flex-accent2/40 bg-flex-accent/10 p-5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
          Quota vidéo (mois)
        </div>
        <div className="text-3xl font-black tracking-tight">∞</div>
        <div className="mt-1 text-[10px] text-flex-muted">
          {isAdmin ? "Admin — illimité" : "Aucun plafond actif"}
        </div>
      </div>
    );
  }
  const pct = Math.min(
    100,
    Math.round((usage.videosGenerated / usage.quota) * 100)
  );
  const danger = pct >= 90;
  const warn = pct >= 60 && !danger;
  return (
    <div
      className={`glass-panel rounded-[1.5rem] p-6 shadow-obsidian transition-transform hover:scale-[1.03] ${
        danger
          ? "border-red-500/40 bg-red-500/10 ambient-glow"
          : warn
            ? "border-flex-accent/40 bg-flex-accent/10 ambient-glow"
            : ""
      }`}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
        Quota vidéo (mois)
      </div>
      <div className="text-3xl font-black tracking-tight">
        {usage.videosGenerated}
        <span className="text-base text-flex-muted"> / {usage.quota}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-flex-border">
        <div
          className={`h-full transition-all ${
            danger
              ? "bg-red-500"
              : warn
                ? "bg-flex-accent"
                : "bg-flex-accent2"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] text-flex-muted">
        {usage.remaining ?? 0} générations restantes
      </div>
    </div>
  );
}
