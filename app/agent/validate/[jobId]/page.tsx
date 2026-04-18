"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

interface AgentCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
  fluxPrompt?: string;
  returning?: boolean;
}

interface AgentScene {
  id: string;
  index: number;
  title: string;
  location: string;
  characters: string[];
  action: string;
  dialogue?: string;
  mood?: string;
  durationSec: number;
  visualPrompt: string;
}

interface StatusResponse {
  status: string;
  progress: number;
  errorMessage?: string | null;
  projectId?: string | null;
  characterImages: Record<string, string[]> | null;
  scenario: {
    concept: Record<string, unknown>;
    characters: AgentCharacter[];
    scenes: AgentScene[];
  } | null;
  updatedAt: string;
}

const POLL_INTERVAL_MS = 4000;

export default function AgentValidatePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCharIdx, setActiveCharIdx] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/status/${jobId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Job inaccessible");
      const json = (await res.json()) as StatusResponse;
      setData(json);
      if (json.status === "done" && json.projectId) {
        router.push(`/watch/${json.projectId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, [jobId, router]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  async function handleApprove() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/agent/validate/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Échec de validation");
      }
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return <CenteredMessage>Chargement…</CenteredMessage>;
  }
  if (!user) {
    return (
      <CenteredMessage>
        Connecte-toi.{" "}
        <Link href="/login" className="text-flex-accent underline">
          Se connecter
        </Link>
      </CenteredMessage>
    );
  }
  if (error) return <CenteredMessage>⚠️ {error}</CenteredMessage>;
  if (!data) return <CenteredMessage>Chargement du job…</CenteredMessage>;

  const status = data.status;
  const progressPct = Math.round(data.progress * 100);
  const scenario = data.scenario;
  const characters = scenario?.characters ?? [];
  const scenes = scenario?.scenes ?? [];
  const images = data.characterImages ?? {};

  // States other than awaiting_validation: show progress
  if (status !== "awaiting_validation") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ProgressCard
          status={status}
          progressPct={progressPct}
          errorMessage={data.errorMessage}
          projectId={data.projectId}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-10 sm:px-6">
      <header className="mb-10 animate-fadeUp">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Validation requise
        </div>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          {(scenario?.concept?.title as string) ?? "Ton film"}
        </h1>
        <p className="mt-3 max-w-2xl text-flex-muted">
          {(scenario?.concept?.synopsis as string) ?? ""}
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">Personnages</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((char) => {
            const charImages = images[char.id] ?? [];
            const idx = activeCharIdx[char.id] ?? 0;
            const activeImg = charImages[idx];
            return (
              <article
                key={char.id}
                className="overflow-hidden rounded-3xl border border-flex-border bg-flex-panel shadow-cinema"
              >
                <div className="relative aspect-[2/3] bg-flex-card">
                  {activeImg ? (
                    <Image src={activeImg} alt={char.name} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-flex-muted">
                      Préviews indisponibles
                    </div>
                  )}
                  {charImages.length > 1 && (
                    <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                      {charImages.map((_, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            setActiveCharIdx((prev) => ({ ...prev, [char.id]: i }))
                          }
                          className={`h-2 rounded-full transition-all ${
                            i === idx
                              ? "w-6 bg-white"
                              : "w-2 bg-white/40 hover:bg-white/70"
                          }`}
                          aria-label={`Variante ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display text-xl font-semibold">{char.name}</h3>
                    <span className="text-xs uppercase tracking-wider text-flex-muted">
                      {char.role}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-flex-muted">{char.description}</p>
                  {char.returning && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-flex-accent/10 px-2 py-0.5 text-xs text-flex-accent">
                      ↺ Personnage récurrent
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">Scènes ({scenes.length})</h2>
        <div className="space-y-3">
          {scenes.map((s) => (
            <article
              key={s.id}
              className="rounded-2xl border border-flex-border bg-flex-card p-4 transition hover:border-flex-accent/50"
            >
              <div className="flex items-baseline gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-flex-accent/20 text-xs font-semibold text-flex-accent">
                  {s.index + 1}
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium">{s.title}</h3>
                    <span className="text-xs text-flex-muted">
                      {s.location} · {s.durationSec}s
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-flex-muted">{s.action}</p>
                  {s.mood && (
                    <div className="mt-2 inline-block rounded bg-flex-bg px-2 py-0.5 text-xs text-flex-muted">
                      {s.mood}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="sticky bottom-4 z-10 mx-auto max-w-xl animate-fadeUp">
        <div className="rounded-3xl border border-flex-border bg-flex-panel/95 p-4 shadow-cinema backdrop-blur-xl">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div>
              <div className="font-medium">Tout te convient ?</div>
              <div className="text-xs text-flex-muted">
                Une fois validée, la génération vidéo démarre (non-remboursable).
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href="/studio"
                className="rounded-full border border-flex-border px-5 py-2.5 text-sm hover:bg-flex-card"
              >
                Plus tard
              </Link>
              <button
                onClick={handleApprove}
                disabled={submitting}
                className="rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-6 py-2.5 text-sm font-medium text-white shadow-glowSm transition hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? "Démarrage…" : "Valider et lancer"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressCard({
  status,
  progressPct,
  errorMessage,
  projectId,
}: {
  status: string;
  progressPct: number;
  errorMessage?: string | null;
  projectId?: string | null;
}) {
  const label = statusLabel(status);
  const isError = status === "error";
  const isDone = status === "done";
  return (
    <div className="rounded-3xl border border-flex-border bg-flex-panel p-10 text-center shadow-cinema">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-flex-accent/10 text-3xl">
        {isError ? "⚠️" : isDone ? "🎬" : "⚙️"}
      </div>
      <h1 className="font-display text-2xl font-bold">{label}</h1>
      {!isError && !isDone && (
        <>
          <div className="mx-auto mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-flex-card">
            <div
              className="h-full bg-gradient-to-r from-flex-accent to-flex-accent2 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-flex-muted">{progressPct}%</div>
          <p className="mt-6 text-sm text-flex-muted">
            Tu peux fermer cette page — tu seras notifié quand ce sera prêt.
          </p>
        </>
      )}
      {isError && (
        <p className="mt-4 text-sm text-red-400">
          {errorMessage || "Erreur inconnue."}
        </p>
      )}
      {isDone && projectId && (
        <Link
          href={`/watch/${projectId}`}
          className="mt-6 inline-block rounded-full bg-flex-accent px-6 py-3 font-medium text-white"
        >
          Voir le film
        </Link>
      )}
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-flex-muted">
      {children}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "En attente de lancement…";
    case "scheduled":
      return "Programmé, lancement automatique à l'heure prévue";
    case "analyzing":
      return "L'agent analyse ton idée…";
    case "scenario_ready":
      return "Préparation de la génération vidéo…";
    case "generating":
      return "Génération des scènes en cours…";
    case "done":
      return "🎬 Ton film est prêt !";
    case "error":
      return "Une erreur est survenue";
    default:
      return status;
  }
}
