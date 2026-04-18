"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import StudioStepper from "@/components/StudioStepper";
import LoadingPulse from "@/components/LoadingPulse";
import ConceptView from "@/components/ConceptView";
import ScenarioView from "@/components/ScenarioView";
import SceneGrid from "@/components/SceneGrid";
import SceneTimeline from "@/components/SceneTimeline";
import AssemblyPlayer from "@/components/AssemblyPlayer";
import FaceSwapPanel from "@/components/FaceSwapPanel";
import LipSyncPanel from "@/components/LipSyncPanel";
import CollaboratorPanel from "@/components/CollaboratorPanel";
import {
  getProject,
  patchProject,
  setVisibility,
} from "@/lib/client-api";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";
import type { Project, Scene } from "@/lib/types";

export default function ProjectWorkspacePage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;
  const { user, loading: authLoading } = useAuth();

  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoGenerating, setVideoGenerating] = useState<Set<string>>(new Set());

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user)
      router.push(`/login?next=/studio/${projectId}`);
  }, [authLoading, user, router, projectId]);

  // Hydrate project from server
  useEffect(() => {
    if (!projectId || !user) return;
    getProject(projectId)
      .then(setProject)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Erreur");
        setTimeout(() => router.push("/dashboard"), 1200);
      });
  }, [projectId, user, router]);

  /** Persist a patch to the server and update local state. */
  const save = useCallback(
    async (patch: Partial<Project>) => {
      if (!project) return;
      try {
        const updated = await patchProject(project.id, patch);
        setProject(updated);
        toast("success", "✓ Sauvegardé");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur de sauvegarde";
        setError(msg);
        toast("error", msg);
      }
    },
    [project, toast]
  );

  // --- Scene editing -----------------------------------------------------

  /** Update a single scene's fields inline and persist the whole scenes
   *  array. Called by SceneGrid when the user edits a card. */
  async function editScene(sceneId: string, patch: Partial<Scene>) {
    if (!project?.scenes) return;
    const nextScenes = project.scenes.map((s) =>
      s.id === sceneId ? { ...s, ...patch } : s
    );
    await save({ scenes: nextScenes });
  }

  /** Add a blank scene at the end. */
  async function addBlankScene() {
    if (!project?.scenes) return;
    const idx = project.scenes.length;
    const newScene: Scene = {
      id: `s_${Date.now()}_${idx}`,
      index: idx,
      title: `Scène ${idx + 1}`,
      location: "",
      timeOfDay: "nuit",
      characters: [],
      action: "",
      dialogue: "",
      mood: "",
      visualPrompt: "",
      durationSec: 8,
      videoStatus: "idle",
    };
    await save({ scenes: [...project.scenes, newScene] });
  }

  /** Remove a scene by id (only if no video generated). */
  async function removeScene(sceneId: string) {
    if (!project?.scenes) return;
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (scene?.videoUrl) return; // can't delete a scene with a video
    const next = project.scenes
      .filter((s) => s.id !== sceneId)
      .map((s, i) => ({ ...s, index: i }));
    await save({ scenes: next });
  }

  /** Move a scene up or down. */
  async function moveScene(sceneId: string, direction: "up" | "down") {
    if (!project?.scenes) return;
    const idx = project.scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= project.scenes.length) return;
    const next = [...project.scenes];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    await save({ scenes: next.map((s, i) => ({ ...s, index: i })) });
  }

  // --- IA actions -------------------------------------------------------

  async function generateConcept() {
    if (!project) return;
    setError(null);
    setLoading("L'IA enrichit ton idée en concept narratif…");
    try {
      const res = await fetch("/api/concept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idea: project.idea,
          genre: project.genre,
          format: project.format,
          tone: project.tone,
          endingHint: project.endingHint,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la génération");
      await save({ concept: data.concept, stage: "concept" });
      toast("success", "Concept généré !");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      toast("error", msg);
    } finally {
      setLoading(null);
    }
  }

  async function generateScenario() {
    if (!project?.concept) return;
    setError(null);
    setLoading("L'IA écrit ton scénario en trois actes…");
    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          concept: project.concept,
          format: project.format,
          genre: project.genre,
          tone: project.tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la génération");
      await save({ scenario: data.scenario, stage: "scenario" });
      toast("success", "Scénario prêt !");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      toast("error", msg);
    } finally {
      setLoading(null);
    }
  }

  async function generateScenes() {
    if (!project?.concept || !project.scenario) return;
    setError(null);
    setLoading("L'IA découpe l'histoire en scènes filmables…");
    try {
      const res = await fetch("/api/scenes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          concept: project.concept,
          scenario: project.scenario,
          format: project.format,
          genre: project.genre,
          tone: project.tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la génération");
      await save({ scenes: data.scenes as Scene[], stage: "scenes" });
      toast("success", "Scènes découpées !");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      toast("error", msg);
    } finally {
      setLoading(null);
    }
  }

  async function generateSceneVideo(scene: Scene) {
    if (!project) return;
    setVideoGenerating((s) => new Set(s).add(scene.id));
    try {
      // Build the final prompt with motion intensity modifier + negative.
      let prompt = scene.visualPrompt;
      if (scene.motionIntensity === "slow") {
        prompt = `slow, deliberate, contemplative motion. ${prompt}`;
      } else if (scene.motionIntensity === "fast") {
        prompt = `fast, energetic, dynamic motion. ${prompt}`;
      }
      if (scene.negativePrompt) {
        prompt = `${prompt}. Avoid: ${scene.negativePrompt}`;
      }

      // Parse reference image URLs for character/element consistency
      const referenceImageUrls = scene.referenceImageUrl
        ? scene.referenceImageUrl.split(",").map((u) => u.trim()).filter(Boolean)
        : undefined;

      const res = await fetch("/api/scene-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          durationSec: scene.durationSec,
          aspectRatio: scene.aspectRatio || "16:9",
          resolution: "720p",
          projectId: project.id,
          sceneId: scene.id,
          referenceImageUrls,
          imageUrl: scene.generationMode === "image-to-video" ? scene.referenceImageUrl?.split(",")[0] : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.skipped) {
          setError(data.error);
          return;
        }
        throw new Error(data.error || "Échec génération vidéo");
      }
      const nextScenes = (project.scenes || []).map((s) =>
        s.id === scene.id
          ? { ...s, videoUrl: data.videoUrl, videoStatus: "ready" as const }
          : s
      );
      await save({ scenes: nextScenes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur vidéo");
    } finally {
      setVideoGenerating((s) => {
        const next = new Set(s);
        next.delete(scene.id);
        return next;
      });
    }
  }

  async function generateAllVideos() {
    if (!project?.scenes) return;
    for (const scene of project.scenes) {
      if (scene.videoUrl) continue;
      // eslint-disable-next-line no-await-in-loop
      await generateSceneVideo(scene);
    }
    await save({ stage: "assembly" });
  }

  async function publish(visibility: "public" | "private" | "followers") {
    if (!project) return;
    try {
      const updated = await setVisibility(project.id, visibility);
      setProject(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur publication");
    }
  }

  // --- Render -----------------------------------------------------------

  if (authLoading || !user || !project) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20">
        <LoadingPulse label="Chargement du projet" />
      </div>
    );
  }

  const isPublic = project.published && project.visibility === "public";

  return (
    <div>
      <StudioStepper
        current={project.stage}
        onJumpTo={(stage) => save({ stage })}
      />

      <div className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-8 rounded-xl border border-flex-border bg-flex-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
                Idée de départ · {project.genre} · {project.format} ·{" "}
                {project.tone}
              </div>
              <div className="mt-1 text-sm text-flex-text">
                « {project.idea} »
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="rounded-lg border border-flex-border bg-flex-card px-3 py-1.5 text-[11px] font-semibold text-flex-text transition hover:border-flex-accent"
              >
                ← Dashboard
              </Link>
              {isPublic ? (
                <span className="rounded-full bg-flex-accent/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-flex-accent">
                  ● Publié — public
                </span>
              ) : (
                <span className="rounded-full bg-flex-border px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-flex-muted">
                  ⎚ Privé
                </span>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            ⚠ {error}
          </div>
        )}

        {loading && <LoadingPulse label={loading} />}

        {/* STEP: idea → concept */}
        {!loading && project.stage === "idea" && (
          <div className="rounded-2xl border border-flex-border bg-flex-card p-10 text-center">
            <h3 className="mb-3 text-3xl font-black">
              Prêt à enrichir ton idée ?
            </h3>
            <p className="mx-auto mb-6 max-w-xl text-sm text-flex-muted">
              L'IA va te proposer un concept complet : titre, logline,
              synopsis, univers visuel et personnages principaux.
            </p>
            <button
              type="button"
              onClick={generateConcept}
              className="rounded-xl bg-flex-accent px-8 py-3 text-base font-bold text-white transition hover:brightness-110"
            >
              ✦ Générer le concept
            </button>
          </div>
        )}

        {/* STEP: concept view */}
        {!loading && project.concept && project.stage === "concept" && (
          <>
            <ConceptView
              concept={project.concept}
              onEdit={(patch) =>
                save({ concept: { ...project.concept!, ...patch } })
              }
            />
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={generateConcept}
                className="rounded-lg border border-flex-border bg-flex-panel px-5 py-3 text-sm font-semibold text-flex-text transition hover:border-flex-accent"
              >
                ↻ Reformuler le concept
              </button>
              <button
                type="button"
                onClick={generateScenario}
                className="rounded-lg bg-flex-accent px-7 py-3 text-sm font-bold text-white transition hover:brightness-110"
              >
                Valider & écrire le scénario →
              </button>
            </div>
          </>
        )}

        {/* STEP: scenario view */}
        {!loading && project.scenario && project.stage === "scenario" && (
          <>
            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-widest text-flex-muted">
                {project.concept?.title}
              </div>
              <h2 className="text-2xl font-black">Scénario structuré</h2>
            </div>
            <ScenarioView scenario={project.scenario} />
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={generateScenario}
                className="rounded-lg border border-flex-border bg-flex-panel px-5 py-3 text-sm font-semibold text-flex-text transition hover:border-flex-accent"
              >
                ↻ Réécrire le scénario
              </button>
              <button
                type="button"
                onClick={generateScenes}
                className="rounded-lg bg-flex-accent px-7 py-3 text-sm font-bold text-white transition hover:brightness-110"
              >
                Découper en scènes →
              </button>
            </div>
          </>
        )}

        {/* STEP: scenes view */}
        {!loading &&
          project.scenes &&
          (project.stage === "scenes" || project.stage === "visuals") && (
            <>
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-flex-muted">
                    {project.concept?.title}
                  </div>
                  <h2 className="text-2xl font-black">
                    {project.scenes.length} scènes prêtes
                  </h2>
                  <p className="text-sm text-flex-muted">
                    Génère chaque plan en vidéo grâce à l&apos;IA.
                    Modifie les scènes avant de lancer la génération.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={generateAllVideos}
                  disabled={videoGenerating.size > 0}
                  className="rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  ✦ Générer toutes les vidéos
                </button>
              </div>
              <SceneTimeline
                scenes={project.scenes}
                generatingIds={videoGenerating}
                onScrollToScene={(index) => {
                  const el = document.getElementById(`scene-${index}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
              <SceneGrid
                scenes={project.scenes}
                onGenerateVideo={generateSceneVideo}
                generatingIds={videoGenerating}
                onEditScene={editScene}
                onDeleteScene={removeScene}
                onMoveScene={moveScene}
              />
              <div className="mt-4">
                <button
                  type="button"
                  onClick={addBlankScene}
                  className="w-full rounded-xl border-2 border-dashed border-flex-border bg-flex-panel/50 py-4 text-sm font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
                >
                  + Ajouter une scène vide
                </button>
              </div>
              {project.scenes.every((s) => s.videoUrl) && (
                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    onClick={() => save({ stage: "assembly" })}
                    className="rounded-lg bg-flex-accent px-7 py-3 text-sm font-bold text-white transition hover:brightness-110"
                  >
                    Assembler le film →
                  </button>
                </div>
              )}
            </>
          )}

        {/* STEP: assembly view */}
        {!loading &&
          project.scenes &&
          project.concept &&
          (project.stage === "assembly" || project.stage === "published") && (
            <>
              <div className="mb-6">
                <div className="text-xs font-semibold uppercase tracking-widest text-flex-muted">
                  Preview final
                </div>
                <h2 className="text-2xl font-black">
                  {project.concept.title}
                </h2>
              </div>
              <AssemblyPlayer
                scenes={project.scenes}
                title={project.concept.title}
              />

              <div className="mt-4 flex justify-center">
                <Link
                  href={`/studio/${projectId}/editor`}
                  className="rounded-lg border border-flex-border bg-flex-panel px-6 py-2.5 text-sm font-semibold text-flex-text transition hover:border-flex-accent hover:text-flex-accent"
                >
                  Ouvrir l&apos;editeur video
                </Link>
              </div>

              {/* Cover picker + Series settings */}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {/* Cover picker */}
                <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
                  <div className="mb-3 text-xs font-bold uppercase tracking-widest text-flex-muted">
                    Image de couverture
                  </div>
                  <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    {project.scenes
                      .filter((s) => s.imageUrl)
                      .map((s, i) => {
                        const selected = project.coverUrl === s.imageUrl;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => save({ coverUrl: s.imageUrl })}
                            className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${
                              selected
                                ? "border-flex-accent shadow-md"
                                : "border-flex-border hover:border-flex-accent/50"
                            }`}
                            title={`Scène ${i + 1} — ${s.title}`}
                          >
                            <div
                              className="h-16 w-28 bg-cover bg-center"
                              style={{
                                backgroundImage: `url(${s.imageUrl})`,
                              }}
                            />
                          </button>
                        );
                      })}
                  </div>
                  <div className="mt-2 text-[10px] text-flex-muted">
                    Choisis quelle scène représente ton film sur le feed.
                  </div>
                </div>

                {/* Series */}
                <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
                  <div className="mb-3 text-xs font-bold uppercase tracking-widest text-flex-muted">
                    Épisode / Série (optionnel)
                  </div>
                  <div className="space-y-2">
                    <input
                      placeholder="Nom de la série"
                      value={project.seriesTitle || ""}
                      onChange={(e) =>
                        save({ seriesTitle: e.target.value })
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      max={99}
                      placeholder="N° épisode"
                      value={project.episodeNumber || ""}
                      onChange={(e) =>
                        save({
                          episodeNumber: Number(e.target.value) || undefined,
                          seriesId:
                            project.seriesId ||
                            `ser_${Date.now()}_${Math.random()
                              .toString(36)
                              .slice(2, 6)}`,
                        })
                      }
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-flex-muted">
                    Groupe tes projets en saison. Les épisodes apparaissent
                    liés sur la page de lecture.
                  </div>
                </div>
              </div>

              {/* AI Tools & Collaboration */}
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FaceSwapPanel />
                <LipSyncPanel
                  projectId={projectId}
                  sceneId={project.scenes?.[0]?.id}
                  videoUrl={project.scenes?.[0]?.videoUrl}
                  audioUrl={project.scenes?.[0]?.voiceoverUrl}
                />
                <CollaboratorPanel
                  projectId={projectId!}
                  isOwner={project.ownerId === user.id}
                />
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => save({ stage: "scenes" })}
                  className="rounded-lg border border-flex-border bg-flex-panel px-5 py-3 text-sm font-semibold text-flex-text transition hover:border-flex-accent"
                >
                  ← Retour aux scènes
                </button>
                <div className="flex items-center gap-2">
                  <select
                    value={project.visibility || "private"}
                    onChange={(e) =>
                      publish(e.target.value as "private" | "followers" | "public")
                    }
                    className="!w-auto !py-2.5 !text-sm !font-semibold"
                  >
                    <option value="private">🔒 Privé — moi seul</option>
                    <option value="followers">👥 Abonnés — mes followers</option>
                    <option value="public">🌍 Public — tout le monde</option>
                  </select>
                </div>
              </div>
            </>
          )}

        {/* STEP: published badge */}
        {!loading && isPublic && project.concept && (
          <div className="mt-10 rounded-2xl border border-flex-accent/40 bg-flex-accent/10 p-8 text-center animate-fadeUp">
            <div className="mb-2 text-5xl">🎬</div>
            <h2 className="mb-2 text-2xl font-black">
              « {project.concept.title} » est visible sur le feed public
            </h2>
            <p className="mx-auto mb-4 max-w-xl text-sm text-flex-muted">
              Ton film apparaît désormais dans le catalogue communautaire,
              recommandé aux spectateurs qui aiment le même genre.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="rounded-lg bg-flex-text px-5 py-2.5 text-sm font-bold text-black transition hover:bg-white"
              >
                Voir mes stats
              </Link>
              <Link
                href="/studio"
                className="rounded-lg border border-flex-border bg-flex-panel px-5 py-2.5 text-sm font-semibold text-flex-text transition hover:border-flex-accent"
              >
                Créer un autre film
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
