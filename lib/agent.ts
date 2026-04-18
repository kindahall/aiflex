import "server-only";
import { prisma } from "./prisma";
import { callNarrativeJSON } from "./ai-client";
import { moderateAndLog } from "./moderation";
import {
  buildAgentInstructions,
  buildSequelAgentInstructions,
  parseAgentResponse,
} from "./prompts/agent";
import { extractParentContext } from "./prompts/sequel";
import { generateCharacterImages } from "./flux";
import {
  submitSceneVideo,
  getSceneVideoStatus,
  getSceneVideoResult,
  type SeedanceQueueHandle,
} from "./seedance";
import { persistVideo, persistVideoWithAiWatermark } from "./video-persist";
import { notify } from "./notify";
import { captureError, trackEvent } from "./observability";
import type { FilmFormat, GenerationMode } from "./types/film";
import { FORMAT_CONFIG, STYLE_PRESETS } from "./types/film";

/**
 * Generation agent orchestrator (V7 §6).
 *
 * One entry point (`orchestrateGeneration(jobId)`) drives a GenerationJob
 * through all states until `done` or `error`. Each sub-step persists its
 * output BEFORE the next step starts, so a crashed process can safely
 * re-enter by calling `orchestrateGeneration` again with the same jobId
 * — the orchestrator will pick up from the last saved status.
 *
 * State machine:
 *   pending            → step_moderate → analyzing
 *   analyzing          → step_analyze  → scenario_ready  (express)
 *                                      → awaiting_validation (assisted, with previews)
 *   awaiting_validation → (blocked; resumed by /api/agent/validate)
 *   scenario_ready     → step_submitClips → generating
 *   generating         → step_pollClips → (loops) → done
 *   error              → terminal
 *
 * The long `generating` phase is designed to be driven by a cron: each
 * tick of `/api/agent/cron-check` re-runs `orchestrateGeneration` for all
 * running jobs, which polls Seedance status and advances when ready.
 */

// ---------------------------------------------------------------------------
// Types for the serialized scenario data we persist between steps
// ---------------------------------------------------------------------------

interface AgentScenarioData {
  concept: Record<string, unknown>;
  characters: AgentCharacter[];
  scenes: AgentScene[];
}

interface AgentCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
  arc?: string;
  fluxPrompt: string;
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
  visualPrompt: string;
  durationSec: number;
  transition?: "cut" | "fade" | "dissolve";
  bridgesFromParent?: boolean;

  // Populated by clips step
  seedanceRequestId?: string;
  seedanceModel?: string;
  seedanceStatus?: string;
  clipUrl?: string | null;
  persistedClipUrl?: string | null;
}

interface AgentFormData {
  mode: GenerationMode;
  format: FilmFormat;
  userPrompt: string;
  stylePresetId?: string;
  parentFilmId?: string;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function orchestrateGeneration(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`GenerationJob ${jobId} not found`);
  if (job.status === "done" || job.status === "error") return;

  try {
    switch (job.status) {
      case "pending":
      case "analyzing":
        await step_moderateAndAnalyze(jobId);
        break;
      case "scenario_ready":
        await step_submitClips(jobId);
        break;
      case "generating":
        await step_pollClips(jobId);
        break;
      case "awaiting_validation":
      case "scheduled":
        // Caller resumes externally (user validation or cron scheduledAt).
        return;
    }

    // If step transitioned to an advanceable state, chain immediately.
    const next = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (
      next &&
      (next.status === "scenario_ready" || next.status === "generating")
    ) {
      await orchestrateGeneration(jobId);
    }
  } catch (err) {
    await captureError(err, { route: "agent.orchestrate", jobId });
    const jobForEvent = await prisma.generationJob
      .findUnique({ where: { id: jobId }, select: { userId: true } })
      .catch(() => null);
    if (jobForEvent) {
      trackEvent(jobForEvent.userId, "generation_failed", {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    }
    await failJob(jobId, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function step_moderateAndAnalyze(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { user: true },
  });
  if (!job) return;
  const form = job.formData as unknown as AgentFormData;

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "analyzing" },
  });

  // 1. Moderation (V8 §19.1) — blocks inappropriate prompts before we spend API budget
  const moderation = await moderateAndLog(prisma, {
    userId: job.userId,
    content: form.userPrompt,
    kind: "visual-prompt",
  });
  if (!moderation.allowed) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        errorMessage: `Prompt refusé par la modération : ${moderation.reason || "non conforme"}`,
      },
    });
    await notify({
      userId: job.userId,
      kind: "system",
      message: `Ta demande n'a pas été acceptée : ${moderation.reason || "contenu non conforme"}`,
      href: "/studio",
    });
    return;
  }

  // 2. Build the agent prompt (standard or sequel variant)
  const styleSuffix = form.stylePresetId
    ? STYLE_PRESETS[form.stylePresetId]?.promptSuffix
    : undefined;

  let instructions: string;
  if (form.parentFilmId) {
    const parent = await prisma.project.findUnique({
      where: { id: form.parentFilmId },
    });
    if (!parent) throw new Error(`Parent film ${form.parentFilmId} not found`);
    instructions = buildSequelAgentInstructions(
      form.format,
      extractParentContext(parent),
      styleSuffix
    );
  } else {
    instructions = buildAgentInstructions(form.format, styleSuffix);
  }

  // 3. Claude call
  const userMessage = `${instructions}\n\nFORMULAIRE UTILISATEUR :\n${form.userPrompt}`;
  const rawJson = await callNarrativeJSON(userMessage);
  const parsed = safeJsonParse(rawJson);
  const { concept, characters, scenes } = parseAgentResponse(parsed);

  const expectedScenes = FORMAT_CONFIG[form.format].sceneCount;
  if (scenes.length === 0) {
    throw new Error("L'agent n'a retourné aucune scène.");
  }
  if (Math.abs(scenes.length - expectedScenes) > 2) {
    // Allow ±2 scene drift, reject large mismatches (model didn't follow instructions)
    throw new Error(
      `L'agent a retourné ${scenes.length} scènes au lieu de ${expectedScenes} attendues.`
    );
  }

  const scenarioData: AgentScenarioData = {
    concept,
    characters: characters as unknown as AgentCharacter[],
    scenes: (scenes as unknown as AgentScene[]).map((s, i) => ({
      ...s,
      index: typeof s.index === "number" ? s.index : i,
      id: s.id || `scene_${i + 1}`,
      clipUrl: null,
      persistedClipUrl: null,
    })),
  };

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      scenarioData: scenarioData as unknown as object,
      status: form.mode === "assisted" ? "scenario_ready" : "scenario_ready",
    },
  });

  // 4. Assisted mode: generate Flux character previews then pause for user validation
  if (form.mode === "assisted") {
    const images = await step_generatePreviews(jobId, scenarioData);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        characterImages: images as unknown as object,
        status: "awaiting_validation",
      },
    });
    await notify({
      userId: job.userId,
      kind: "system",
      message:
        "Tes personnages sont prêts à être validés. Ouvre AiFlex pour les voir.",
      href: `/agent/validate/${jobId}`,
    });
    return;
  }

  // Express mode: proceed to clips immediately (chained by caller)
}

async function step_generatePreviews(
  jobId: string,
  scenarioData: AgentScenarioData
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const char of scenarioData.characters) {
    try {
      const urls = await generateCharacterImages(char.fluxPrompt, jobId, 3);
      out[char.id] = urls;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[agent] preview failed for ${char.id}:`, err);
      out[char.id] = [];
    }
  }
  return out;
}

async function step_submitClips(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const form = job.formData as unknown as AgentFormData;
  const scenario = (job.validatedData as unknown as AgentScenarioData) ||
    (job.scenarioData as unknown as AgentScenarioData);
  if (!scenario?.scenes?.length) {
    throw new Error("Pas de scénario à générer — le scénario n'a pas été préparé.");
  }

  const aspect = FORMAT_CONFIG[form.format].aspectRatio;
  const updatedScenes: AgentScene[] = [];
  for (const scene of scenario.scenes) {
    // If this scene was already submitted (resume case), skip.
    if (scene.seedanceRequestId) {
      updatedScenes.push(scene);
      continue;
    }
    try {
      const handle: SeedanceQueueHandle = await submitSceneVideo({
        prompt: scene.visualPrompt,
        durationSec: Math.max(5, Math.min(10, scene.durationSec || 8)),
        aspectRatio: aspect,
      });
      updatedScenes.push({
        ...scene,
        seedanceRequestId: handle.requestId,
        seedanceModel: handle.model,
        seedanceStatus: "IN_QUEUE",
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[agent] submit failed for ${scene.id}:`, err);
      updatedScenes.push({ ...scene, seedanceStatus: "ERROR" });
    }
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      scenarioData: {
        ...scenario,
        scenes: updatedScenes,
      } as unknown as object,
      status: "generating",
    },
  });
}

async function step_pollClips(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const scenario = job.scenarioData as unknown as AgentScenarioData;
  if (!scenario?.scenes?.length) return;

  let allDone = true;
  let anyError = false;
  const updatedScenes: AgentScene[] = [];

  for (const scene of scenario.scenes) {
    if (scene.persistedClipUrl) {
      updatedScenes.push(scene);
      continue;
    }
    if (!scene.seedanceRequestId || !scene.seedanceModel) {
      allDone = false;
      anyError = true;
      updatedScenes.push(scene);
      continue;
    }
    try {
      const status = await getSceneVideoStatus({
        requestId: scene.seedanceRequestId,
        model: scene.seedanceModel,
      });
      if (status === "COMPLETED") {
        const result = await getSceneVideoResult({
          requestId: scene.seedanceRequestId,
          model: scene.seedanceModel,
        });
        // AI-generated public content gets the AI Act watermark burned in
        // before being stored. Private / cercle-privé content is persisted
        // as-is to save the ffmpeg pass.
        const needsWatermark = job.visibility === "public";
        const persister = needsWatermark
          ? persistVideoWithAiWatermark
          : persistVideo;
        const persisted = await persister(
          result.videoUrl,
          job.projectId || jobId,
          scene.id
        );
        updatedScenes.push({
          ...scene,
          seedanceStatus: status,
          clipUrl: result.videoUrl,
          persistedClipUrl: persisted,
        });
      } else if (status === "ERROR") {
        anyError = true;
        updatedScenes.push({ ...scene, seedanceStatus: status });
      } else {
        allDone = false;
        updatedScenes.push({ ...scene, seedanceStatus: status });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[agent] poll failed for ${scene.id}:`, err);
      allDone = false;
      updatedScenes.push(scene);
    }
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      scenarioData: {
        ...scenario,
        scenes: updatedScenes,
      } as unknown as object,
    },
  });

  if (allDone) {
    if (anyError && updatedScenes.every((s) => !s.persistedClipUrl)) {
      throw new Error("Toutes les scènes ont échoué en génération.");
    }
    await step_finalize(jobId);
  }
}

async function step_finalize(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const scenario = job.scenarioData as unknown as AgentScenarioData;
  const { ensureUniqueSlug } = await import("./slug");

  // Build the Project composition manifest consumed by the player.
  const composition = {
    fps: 30,
    scenes: scenario.scenes.map((s) => ({
      id: s.id,
      index: s.index,
      prompt: s.visualPrompt,
      clipUrl: s.persistedClipUrl ?? null,
      duration: Math.max(150, Math.round((s.durationSec || 8) * 30)),
      transition: s.transition || "cut",
      subtitle: s.dialogue ?? null,
    })),
    music: null,
    totalDurationInFrames: scenario.scenes.reduce(
      (acc, s) => acc + Math.round((s.durationSec || 8) * 30),
      0
    ),
  };

  // Update or create the Project row the job points at.
  const title = (scenario.concept.title as string) || "Sans titre";
  let projectId = job.projectId;
  if (!projectId) {
    const form = job.formData as unknown as AgentFormData;
    const created = await prisma.project.create({
      data: {
        ownerId: job.userId,
        stage: "ready",
        idea: form.userPrompt,
        genre: (scenario.concept.genre as string) || "drama",
        format: form.format,
        tone: (scenario.concept.tone as string) || "cinematic",
        title,
        synopsis: (scenario.concept.synopsis as string) || "",
        status: "ready",
        visibility: form.parentFilmId ? "public" : job.visibility,
        parentFilmId: form.parentFilmId ?? null,
        composition: composition as unknown as object,
        scenes: scenario.scenes as unknown as object,
        concept: scenario.concept as unknown as object,
        publishedAt: job.visibility === "public" ? new Date() : null,
      },
    });
    projectId = created.id;
  } else {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "ready",
        composition: composition as unknown as object,
        scenes: scenario.scenes as unknown as object,
        concept: scenario.concept as unknown as object,
        publishedAt: job.visibility === "public" ? new Date() : undefined,
      },
    });
  }

  // SEO slug — only for public projects (private URLs never get indexed).
  // V8 §20.2 — also lock sequels for the first 7 days so the creator has
  // time to react/disable allowSequels before anyone forks.
  if (job.visibility === "public" && projectId) {
    const slug = await ensureUniqueSlug(title, projectId);
    const sequelsUnlockAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
      await prisma.project.update({
        where: { id: projectId },
        data: { slug, sequelsUnlockAt },
      });
    } catch {
      // Unique collision on slug is virtually impossible given the id suffix,
      // but ignore rather than failing finalize.
    }

    // Precompute recommendation embedding. Fire-and-forget: pgvector may be
    // absent, OpenAI may be missing — don't block finalize for reco.
    import("./recommendations-vec")
      .then(({ upsertProjectEmbedding }) => upsertProjectEmbedding(projectId!))
      .catch(() => {});

    // Auto-transcribe + translate (V8 §22.6). Fire-and-forget: no OpenAI key
    // means we silently skip. Dubbing is creator-opt-in only.
    import("./subtitles-whisper")
      .then(({ generateSubtitlesForProject }) =>
        generateSubtitlesForProject(projectId!)
      )
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[agent] subtitle generation failed:", err);
      });

    // V8 §23.3 — generate an AI-suggested thumbnail from the synopsis when
    // the film doesn't already have one. Fire-and-forget; ffmpeg/Flux may
    // be unavailable in dev. Uses the synopsis as a poster-friendly prompt.
    const synopsis = (scenario.concept.synopsis as string) || title;
    import("./flux")
      .then(({ generateThumbnail }) => generateThumbnail(synopsis, projectId!))
      .then((thumbnailUrl) =>
        prisma.project.update({
          where: { id: projectId! },
          data: { thumbnailUrl },
        })
      )
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[agent] thumbnail generation failed:", err);
      });

    // V8 §24.3 — notify followers of the publishing creator. Fan-out is
    // fire-and-forget and capped at 500 followers per release to avoid
    // hammering the in-memory job queue on viral creators.
    void (async () => {
      try {
        const followers = await prisma.follow.findMany({
          where: { followedId: job.userId },
          select: { followerId: true },
          take: 500,
        });
        for (const f of followers) {
          notify({
            userId: f.followerId,
            kind: "system",
            message: `🎬 Un créateur que tu suis vient de publier "${title}".`,
            href: `/watch/${projectId}`,
            projectId: projectId!,
            actorId: job.userId,
          }).catch(() => {});
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[agent] follower notification fan-out failed:", err);
      }
    })();
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: "done",
      projectId,
    },
  });

  await notify({
    userId: job.userId,
    kind: "video-ready",
    message: "🎬 Ton film est prêt !",
    href: `/watch/${projectId}`,
    projectId,
  });

  trackEvent(job.userId, "generation_completed", {
    jobId,
    projectId,
    format: job.format,
    mode: job.mode,
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Cron entry — advance every running job one tick
// ---------------------------------------------------------------------------

/**
 * Called by /api/agent/cron-check every 5 minutes (V7 §17 #31).
 * Also handles `scheduled` jobs whose launchAt has elapsed.
 */
export async function cronAdvanceAllJobs(): Promise<{
  advanced: number;
  launched: number;
  failed: number;
  autoApproved: number;
}> {
  let advanced = 0;
  let launched = 0;
  let failed = 0;
  const now = new Date();

  // 1. Launch any scheduled jobs whose launchAt has elapsed
  const readyToLaunch = await prisma.generationJob.findMany({
    where: {
      status: "scheduled",
      launchAt: { lte: now },
    },
    select: { id: true },
  });
  for (const { id } of readyToLaunch) {
    await prisma.generationJob.update({
      where: { id },
      data: { status: "pending" },
    });
    try {
      await orchestrateGeneration(id);
      launched++;
    } catch {
      failed++;
    }
  }

  // 2. Poll any generating jobs
  const generating = await prisma.generationJob.findMany({
    where: { status: "generating" },
    select: { id: true },
    take: 50, // cap per tick
  });
  for (const { id } of generating) {
    try {
      await orchestrateGeneration(id);
      advanced++;
    } catch {
      failed++;
    }
  }

  // 3. Auto-approve any sequel pending parent approval that has hit its
  //    72h deadline (V8 §20.3). Parent silence = consent.
  let autoApproved = 0;
  const candidates = await prisma.generationJob.findMany({
    where: { status: "awaiting_validation" },
    select: { id: true, formData: true },
    take: 50,
  });
  for (const job of candidates) {
    const fd = (job.formData as Record<string, unknown>) || {};
    if (!fd.parentApprovalRequired) continue;
    const deadline = fd.parentApprovalDeadline as string | undefined;
    if (!deadline) continue;
    if (new Date(deadline) > new Date()) continue;
    try {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "pending" },
      });
      orchestrateGeneration(job.id).catch(() => {});
      autoApproved++;
    } catch {
      failed++;
    }
  }

  return { advanced, launched, failed, autoApproved };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function failJob(jobId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "error", errorMessage: message.slice(0, 1000) },
    });
  } catch {
    // ignore nested error
  }
}

function safeJsonParse(text: string): unknown {
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1) {
    clean = clean.slice(first, last + 1);
  }
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("Agent response was not valid JSON.");
  }
}

// ---------------------------------------------------------------------------
// Validation resume (called by /api/agent/validate)
// ---------------------------------------------------------------------------

/**
 * Resume an awaiting_validation job after the user has either accepted the
 * preview as-is, or edited scenario/character data (sent via `validatedData`).
 */
export async function resumeValidatedJob(
  jobId: string,
  validatedData?: AgentScenarioData
): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`GenerationJob ${jobId} not found`);
  if (job.status !== "awaiting_validation") {
    throw new Error(`Job ${jobId} is not awaiting validation (status=${job.status}).`);
  }
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      validatedData: (validatedData ?? job.scenarioData) as unknown as object,
      status: "scenario_ready",
    },
  });
  await orchestrateGeneration(jobId);
}
