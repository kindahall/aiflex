import "server-only";
import { prisma } from "./prisma";
import { callNarrativeJSON } from "./ai-client";
import { moderateAndLog } from "./moderation";
import {
  buildSeriesConceptInstructions,
  buildEpisodeScenarioInstructions,
  buildEpisodeScenesInstructions,
} from "./prompts/series";
import type { FilmFormat } from "./types/film";
import { FORMAT_CONFIG, SERIES_CONFIG, STYLE_PRESETS } from "./types/film";
import { orchestrateGeneration } from "./agent";
import { notify } from "./notify";

/**
 * Series generation (V7 §5).
 *
 * A series is produced in TWO phases:
 *   Phase 1 (fast, 1 Claude call) — generate the series concept with all
 *     N episode skeletons + cliffhangers. Persisted to Series + N skeleton
 *     Projects (with seriesId + episodeNumber). No video yet — episodes
 *     are in status="pending".
 *   Phase 2 (slow, N agent orchestrations) — for each episode, generate
 *     its full scene-level scenario with its own GenerationJob and let the
 *     standard agent pipeline handle video clips + persistence.
 *
 * Binge mode launches all N episodes in parallel. Weekly mode launches
 * episode 1 immediately and schedules the others 7 days apart via
 * `scheduledAt` + `launchAt`.
 */

export interface SeriesCreateParams {
  userId: string;
  userPrompt: string;
  seriesPackId: keyof typeof SERIES_CONFIG;
  mode: "express" | "assisted";
  visibility: "private" | "private_circle" | "public";
  releaseMode: "binge" | "weekly";
  stylePresetId?: string;
}

export interface SeriesCreateResult {
  seriesId: string;
  episodeCount: number;
  firstJobIds: string[];
}

/**
 * Entry point. Called by /api/series/create AFTER payment is confirmed
 * (or directly for admin-seeded content).
 */
export async function createSeries(
  params: SeriesCreateParams
): Promise<SeriesCreateResult> {
  const pack = SERIES_CONFIG[params.seriesPackId];
  if (!pack) throw new Error("Pack série inconnu");
  const format = pack.format;

  // 1. Moderation on the user prompt
  const moderation = await moderateAndLog(prisma, {
    userId: params.userId,
    content: params.userPrompt,
    kind: "visual-prompt",
  });
  if (!moderation.allowed) {
    throw new Error(
      `Prompt refusé par la modération : ${moderation.reason || "non conforme"}`
    );
  }

  // 2. Claude series concept (1 call, all episodes)
  const styleSuffix = params.stylePresetId
    ? STYLE_PRESETS[params.stylePresetId]?.promptSuffix
    : undefined;
  const conceptInstructions = buildSeriesConceptInstructions(
    pack.episodeCount,
    format
  );
  const userMessage = `${conceptInstructions}\n\nFORMULAIRE UTILISATEUR :\n${params.userPrompt}${
    styleSuffix ? `\n\nSTYLE : ${styleSuffix}` : ""
  }`;
  const rawJson = await callNarrativeJSON(userMessage);
  const concept = safeJsonParse(rawJson) as {
    seriesTitle: string;
    seriesLogline: string;
    seriesSynopsis: string;
    genre: string;
    tone: string;
    episodes: Array<{
      episodeNumber: number;
      title: string;
      logline: string;
      summary: string;
      cliffhanger: string;
    }>;
  };

  if (!Array.isArray(concept.episodes) || concept.episodes.length === 0) {
    throw new Error("L'agent n'a retourné aucun épisode.");
  }
  if (Math.abs(concept.episodes.length - pack.episodeCount) > 1) {
    throw new Error(
      `L'agent a retourné ${concept.episodes.length} épisodes au lieu de ${pack.episodeCount}.`
    );
  }

  // 3. Persist the Series + one Project per episode (skeletons)
  const series = await prisma.series.create({
    data: {
      ownerId: params.userId,
      title: concept.seriesTitle,
      synopsis: concept.seriesSynopsis,
      genre: concept.genre,
      visibility: params.visibility,
      releaseMode: params.releaseMode,
      status: "generating",
    },
  });

  const episodeProjects = await Promise.all(
    concept.episodes.map((ep, idx) =>
      prisma.project.create({
        data: {
          ownerId: params.userId,
          stage: "generating",
          idea: params.userPrompt,
          genre: concept.genre,
          format,
          tone: concept.tone,
          seriesId: series.id,
          seriesTitle: concept.seriesTitle,
          episodeNumber: ep.episodeNumber,
          seasonNumber: 1,
          title: ep.title,
          synopsis: ep.summary,
          visibility: params.visibility,
          status: "pending",
          concept: ep as unknown as object,
        },
      })
    )
  );

  // 4. Launch per-episode generation jobs
  //   - binge   : all immediate
  //   - weekly  : episode 1 immediate, others scheduled 7 days apart
  const firstJobIds: string[] = [];
  const baseTime = Date.now();
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  for (const [idx, project] of episodeProjects.entries()) {
    const launchAt =
      params.releaseMode === "weekly" && idx > 0
        ? new Date(baseTime + idx * WEEK)
        : null;
    const scheduledAt = launchAt;

    const job = await prisma.generationJob.create({
      data: {
        userId: params.userId,
        projectId: project.id,
        mode: params.mode,
        format,
        visibility: params.visibility,
        userPrompt: `[Série : ${concept.seriesTitle}] Épisode ${idx + 1}/${concept.episodes.length} — ${concept.episodes[idx].summary}`,
        scheduledAt,
        launchAt,
        formData: {
          mode: params.mode,
          format,
          userPrompt: params.userPrompt,
          stylePresetId: params.stylePresetId,
          seriesId: series.id,
          episodeNumber: idx + 1,
        } as unknown as object,
        status: launchAt && launchAt > new Date() ? "scheduled" : "pending",
      },
    });
    firstJobIds.push(job.id);

    // Kick off immediate episodes, detached
    if (job.status === "pending") {
      orchestrateGeneration(job.id).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[series-orchestrator] ep${idx + 1} failed:`, err);
      });
    }
  }

  notify({
    userId: params.userId,
    kind: "system",
    message: `🎬 Ta série "${concept.seriesTitle}" est en cours de génération. ${
      params.releaseMode === "weekly"
        ? `1 épisode par semaine, ${pack.episodeCount} au total.`
        : `Tous les épisodes en même temps.`
    }`,
    href: `/dashboard`,
  }).catch(() => {});

  return {
    seriesId: series.id,
    episodeCount: concept.episodes.length,
    firstJobIds,
  };
}

// ---------------------------------------------------------------------------
// Per-episode scenario (called lazily by the standard agent when it picks up
// a GenerationJob with a seriesId; for now we don't wire this because the
// default agent flow regenerates a concept per job. Future: agent.ts detects
// `formData.seriesId` and uses buildEpisodeScenarioInstructions instead).
// ---------------------------------------------------------------------------

/** Expose prompts so the agent can call them when it detects a series job. */
export { buildEpisodeScenarioInstructions, buildEpisodeScenesInstructions };

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

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
    throw new Error("Series concept response was not valid JSON.");
  }
}

// ---------------------------------------------------------------------------
// Weekly cron — publish the next episode of every "weekly" series
// ---------------------------------------------------------------------------

/**
 * Invoked by `/api/series/publish-scheduled` every Monday 09:00 UTC.
 *
 * Flips any `scheduled` GenerationJob on a weekly series whose `launchAt`
 * has elapsed into `pending` and kicks off orchestration. The standard
 * cron (/api/agent/cron-check) also picks these up; this one is a nicer
 * UX touch so episodes always start on a predictable schedule.
 */
export async function cronPublishWeeklyEpisodes(): Promise<{
  launched: number;
}> {
  const now = new Date();
  const ready = await prisma.generationJob.findMany({
    where: {
      status: "scheduled",
      launchAt: { lte: now },
    },
    select: { id: true },
    take: 50,
  });

  let launched = 0;
  for (const { id } of ready) {
    await prisma.generationJob.update({
      where: { id },
      data: { status: "pending" },
    });
    orchestrateGeneration(id).catch(() => {});
    launched++;
  }
  return { launched };
}
