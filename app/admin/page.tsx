"use client";

import { useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";

interface Stats {
  totalUsers: number;
  suspendedUsers: number;
  admins: number;
  totalProjects: number;
  publishedProjects: number;
  totalScenes: number;
  totalVideos: number;
  last7DaysSignups: number;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStats(data.stats);
      });
  }, []);

  if (error)
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        ⚠ {error}
      </div>
    );
  if (!stats) return <LoadingPulse label="Chargement des statistiques" />;

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Comptes totaux" value={stats.totalUsers} />
        <Metric
          label="Inscriptions 7 derniers jours"
          value={stats.last7DaysSignups}
          accent
        />
        <Metric label="Admins" value={stats.admins} />
        <Metric label="Comptes suspendus" value={stats.suspendedUsers} />
        <Metric label="Projets totaux" value={stats.totalProjects} />
        <Metric
          label="Films publiés"
          value={stats.publishedProjects}
          accent
        />
        <Metric label="Scènes écrites" value={stats.totalScenes} />
        <Metric
          label="Vidéos IA générées"
          value={stats.totalVideos}
          accent
        />
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-flex-border bg-flex-card p-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-flex-muted">
            Actions rapides
          </div>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="/admin/users"
                className="flex items-center justify-between rounded-lg bg-flex-panel px-4 py-3 transition hover:bg-flex-border"
              >
                <span>Gérer les utilisateurs</span>
                <span className="text-flex-accent">→</span>
              </a>
            </li>
            <li>
              <a
                href="/admin/projects"
                className="flex items-center justify-between rounded-lg bg-flex-panel px-4 py-3 transition hover:bg-flex-border"
              >
                <span>Modérer les projets</span>
                <span className="text-flex-accent">→</span>
              </a>
            </li>
            <li>
              <a
                href="/admin/reports"
                className="flex items-center justify-between rounded-lg bg-flex-panel px-4 py-3 transition hover:bg-flex-border"
              >
                <span>Signalements & modération</span>
                <span className="text-flex-accent">→</span>
              </a>
            </li>
            <li>
              <a
                href="/admin/settings"
                className="flex items-center justify-between rounded-lg bg-flex-panel px-4 py-3 transition hover:bg-flex-border"
              >
                <span>Configurer les modèles IA (Claude, Seedance…)</span>
                <span className="text-flex-accent">→</span>
              </a>
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-flex-border bg-flex-card p-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-flex-muted">
            Santé de la plateforme
          </div>
          <div className="space-y-3 text-sm">
            <HealthRow
              label="Taux de publication"
              value={`${stats.totalProjects ? Math.round((stats.publishedProjects / stats.totalProjects) * 100) : 0}%`}
            />
            <HealthRow
              label="Scènes vidéo / scènes totales"
              value={`${stats.totalScenes ? Math.round((stats.totalVideos / stats.totalScenes) * 100) : 0}%`}
            />
            <HealthRow
              label="Ratio admins / utilisateurs"
              value={`${stats.totalUsers ? ((stats.admins / stats.totalUsers) * 100).toFixed(1) : 0}%`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-flex-accent/40 bg-flex-accent/10"
          : "border-flex-border bg-flex-card"
      }`}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
        {label}
      </div>
      <div className="text-3xl font-black tracking-tight">
        {value.toLocaleString("fr-FR")}
      </div>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-flex-panel px-4 py-3">
      <span className="text-flex-muted">{label}</span>
      <span className="font-mono font-bold text-flex-text">{value}</span>
    </div>
  );
}
