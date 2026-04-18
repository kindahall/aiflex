"use client";

import { useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import type {
  NarrativeModelOption,
  PlatformSettings,
  VideoModelOption,
} from "@/lib/platform-settings";
import {
  getLLMCapabilities,
  REASONING_LABELS,
  type ReasoningLevel,
} from "@/lib/video-capabilities";

interface SettingsResponse {
  settings: PlatformSettings & {
    keyStatus: { openai: boolean; anthropic: boolean; fal: boolean };
  };
  narrativeModels: NarrativeModelOption[];
  videoModels: VideoModelOption[];
}

export default function AdminSettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (body.error) setError(body.error);
        else setData(body);
      });
  }, []);

  async function patch(partial: Partial<PlatformSettings>) {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(partial),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setData({ ...data, settings: { ...data.settings, ...body.settings } });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  if (error && !data)
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        ⚠ {error}
      </div>
    );
  if (!data) return <LoadingPulse label="Chargement de la configuration" />;

  const { settings, narrativeModels, videoModels } = data;
  const activeNarrative = narrativeModels.find(
    (m) => m.id === settings.narrativeModel
  );
  const activeVideo = videoModels.find(
    (m) => m.id === settings.videoModel
  );

  return (
    <div className="space-y-6">
      {savedAt && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          ✓ Configuration enregistrée.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          ⚠ {error}
        </div>
      )}

      {/* Models — compact select rows */}
      <div className="rounded-2xl border border-flex-border bg-flex-card p-6 space-y-5">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent">
            Modèles IA
          </div>
          <h3 className="text-xl font-black">Configuration des moteurs</h3>
        </div>

        {/* Narrative model */}
        <div className="rounded-xl bg-flex-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-flex-text">
                Modèle narratif
              </div>
              <div className="text-xs text-flex-muted">
                Génère concept, scénario et découpage des scènes.
              </div>
            </div>
            <select
              value={settings.narrativeModel}
              disabled={saving}
              onChange={(e) => patch({ narrativeModel: e.target.value })}
              className="!w-auto !min-w-[200px]"
            >
              {narrativeModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.provider})
                </option>
              ))}
            </select>
          </div>
          {activeNarrative && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-flex-muted">
              <span className="rounded-full bg-flex-accent/20 px-2 py-0.5 font-bold uppercase tracking-widest text-flex-accent">
                {activeNarrative.provider}
              </span>
              <span>{activeNarrative.note}</span>
            </div>
          )}
          {/* Reasoning level — dynamic based on selected model */}
          {(() => {
            const caps = getLLMCapabilities(settings.narrativeModel);
            if (!caps.supportsReasoning) return null;
            return (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-flex-card p-3">
                <div>
                  <div className="text-xs font-semibold text-flex-text">
                    Niveau de réflexion
                  </div>
                  <div className="text-[10px] text-flex-muted">
                    Plus de réflexion = meilleur résultat mais plus lent.
                  </div>
                </div>
                <select
                  value={settings.reasoningLevel || caps.defaultReasoning}
                  disabled={saving}
                  onChange={(e) => patch({ reasoningLevel: e.target.value })}
                  className="!w-auto"
                >
                  {caps.reasoningLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {REASONING_LABELS[lvl as ReasoningLevel]}
                    </option>
                  ))}
                </select>
              </div>
            );
          })()}
        </div>

        {/* Video model */}
        <div className="rounded-xl bg-flex-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-flex-text">
                Modèle vidéo
              </div>
              <div className="text-xs text-flex-muted">
                Transforme chaque scène en clip vidéo.
              </div>
            </div>
            <select
              value={settings.videoModel}
              disabled={saving}
              onChange={(e) => patch({ videoModel: e.target.value })}
              className="!w-auto !min-w-[240px]"
            >
              {videoModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {activeVideo && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-flex-muted">
              <span className="rounded-full bg-flex-accent/20 px-2 py-0.5 font-bold uppercase tracking-widest text-flex-accent">
                {activeVideo.provider}
              </span>
              <span>{activeVideo.note}</span>
            </div>
          )}
        </div>
      </div>

      {/* Policy knobs */}
      <div className="rounded-2xl border border-flex-border bg-flex-card p-6 space-y-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent">
            Politique de la plateforme
          </div>
          <h3 className="text-xl font-black">Contrôles globaux</h3>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl bg-flex-panel p-4">
          <div>
            <div className="text-sm font-semibold text-flex-text">
              Inscriptions ouvertes
            </div>
            <div className="text-xs text-flex-muted">
              Désactive pour bloquer les nouveaux comptes.
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.allowSignups}
            onChange={(e) => patch({ allowSignups: e.target.checked })}
            className="!h-6 !w-12 !cursor-pointer !rounded-full !border-0 !bg-flex-border !p-0 checked:!bg-flex-accent !appearance-none !m-0"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block rounded-xl bg-flex-panel p-4">
            <div className="mb-2">
              <div className="text-sm font-semibold text-flex-text">
                Max scènes / projet
              </div>
              <div className="text-xs text-flex-muted">
                Limite le coût de génération par film.
              </div>
            </div>
            <input
              type="number"
              min={4}
              max={50}
              value={settings.maxScenesPerProject}
              onChange={(e) =>
                patch({ maxScenesPerProject: Number(e.target.value) })
              }
              className="!max-w-[100px]"
            />
          </label>
          <label className="block rounded-xl bg-flex-panel p-4">
            <div className="mb-2">
              <div className="text-sm font-semibold text-flex-text">
                Quota vidéo / mois / user
              </div>
              <div className="text-xs text-flex-muted">
                0 = illimité. Admins exemptés.
              </div>
            </div>
            <input
              type="number"
              min={0}
              max={10000}
              value={settings.monthlyVideoQuota}
              onChange={(e) =>
                patch({ monthlyVideoQuota: Number(e.target.value) })
              }
              className="!max-w-[100px]"
            />
          </label>
        </div>
      </div>

      {/* API Keys */}
      <FeaturedFilmSection
        settings={settings}
        saving={saving}
        onSave={patch}
      />

      <ApiKeysSection
        settings={settings}
        saving={saving}
        onSave={patch}
      />
    </div>
  );
}

// ─── Featured Film Section ───────────────────────────────────────────

function FeaturedFilmSection({
  settings,
  saving,
  onSave,
}: {
  settings: PlatformSettings;
  saving: boolean;
  onSave: (patch: Partial<PlatformSettings>) => Promise<void>;
}) {
  const [films, setFilms] = useState<
    Array<{ id: string; title: string; author: string; genre: string }>
  >([]);

  useEffect(() => {
    fetch("/api/feed")
      .then((r) => r.json())
      .then((d) => {
        const items = (d.items || d.projects || []).map(
          (p: { id: string; title?: string; concept?: { title?: string }; author?: string; genre?: string }) => ({
            id: p.id,
            title: p.title || p.concept?.title || "Sans titre",
            author: p.author || "—",
            genre: p.genre || "—",
          })
        );
        setFilms(items);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-6 space-y-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent">
          Page d&apos;accueil
        </div>
        <h3 className="text-xl font-black">Film en affiche</h3>
        <p className="mt-1 text-xs text-flex-muted">
          Choisis quel film publié apparaît dans le héro de la page d&apos;atterrissage.
          Si aucun n&apos;est sélectionné, un film du catalogue démo est affiché.
        </p>
      </div>

      <div className="rounded-xl bg-flex-panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-sm font-semibold text-flex-text">
            Film sélectionné
          </div>
          {settings.featuredProjectId && (
            <button
              type="button"
              onClick={() => onSave({ featuredProjectId: undefined })}
              disabled={saving}
              className="text-[10px] text-flex-muted hover:text-red-400 transition"
            >
              Retirer l&apos;affiche
            </button>
          )}
        </div>

        {films.length === 0 ? (
          <p className="text-xs text-flex-muted">
            Aucun film publié disponible. Publie un film pour le mettre en
            affiche.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {films.map((film) => {
              const isSelected = settings.featuredProjectId === film.id;
              return (
                <button
                  key={film.id}
                  type="button"
                  disabled={saving}
                  onClick={() => onSave({ featuredProjectId: film.id })}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition ${
                    isSelected
                      ? "bg-flex-accent/20 border border-flex-accent"
                      : "bg-flex-card border border-flex-border hover:border-flex-accent/50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-flex-text truncate">
                      {isSelected && "✦ "}
                      {film.title}
                    </div>
                    <div className="text-[10px] text-flex-muted">
                      par {film.author} · {film.genre}
                    </div>
                  </div>
                  {isSelected && (
                    <span className="shrink-0 rounded-full bg-flex-accent px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                      En affiche
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── API Keys Section ────────────────────────────────────────────────

function ApiKeysSection({
  settings,
}: {
  settings: PlatformSettings & {
    keyStatus: { openai: boolean; anthropic: boolean; fal: boolean };
  };
  saving: boolean;
  onSave: (patch: Partial<PlatformSettings>) => Promise<void>;
}) {
  const keys = [
    { id: "openai", label: "OpenAI", env: "OPENAI_API_KEY", active: settings.keyStatus.openai },
    { id: "anthropic", label: "Anthropic", env: "ANTHROPIC_API_KEY", active: settings.keyStatus.anthropic },
    { id: "fal", label: "fal.ai (vidéo)", env: "FAL_KEY", active: settings.keyStatus.fal },
  ];

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-6 space-y-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent">
          Clés API
        </div>
        <h3 className="text-xl font-black">Connexion aux providers</h3>
        <p className="mt-1 text-xs text-flex-muted">
          Les clés API sont lues exclusivement depuis les variables
          d&apos;environnement. Configure-les dans <code>.env.local</code> (dev)
          ou dans le secret manager de ton hébergement (prod), puis redémarre
          le serveur.
        </p>
      </div>

      {keys.map((k) => (
        <div key={k.id} className="rounded-xl bg-flex-panel p-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                k.active ? "bg-emerald-400" : "bg-red-400"
              }`}
              title={k.active ? "Configurée" : "Manquante"}
            />
            <div className="text-sm font-semibold text-flex-text">
              {k.label}
            </div>
            <span className="ml-auto font-mono text-[10px] text-flex-muted">
              {k.env} {k.active ? "✓ configurée" : "✗ manquante"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
