import "server-only";
import { registerHandler, type Job } from "../job-queue";
import { generateSceneVideo, hasSeedanceKey } from "../seedance";
import { persistVideo } from "../video-persist";
import { getProjectById, updateProject } from "../server-db";
import { notify } from "../notify";
import type { Scene } from "../types";

/**
 * Job handler for async video generation.
 *
 * Payload:
 *   projectId: string
 *   sceneId: string
 *   prompt: string
 *   durationSec?: number
 *   aspectRatio?: "16:9" | "9:16" | "1:1"
 *   resolution?: "480p" | "720p" | "1080p"
 */
async function handleVideoGeneration(
  job: Job,
  updateProgress: (pct: number) => void
): Promise<{ videoUrl: string }> {
  const { projectId, sceneId, prompt, durationSec, aspectRatio, resolution, referenceImageUrls, imageUrl } =
    job.payload as {
      projectId: string;
      sceneId: string;
      prompt: string;
      durationSec?: number;
      aspectRatio?: "16:9" | "9:16" | "1:1";
      resolution?: "480p" | "720p" | "1080p";
      referenceImageUrls?: string[];
      imageUrl?: string;
    };

  // Validate inputs
  if (!projectId || !sceneId || !prompt) {
    throw new Error("Missing required fields: projectId, sceneId, prompt");
  }

  if (!(await hasSeedanceKey())) {
    throw new Error("FAL_KEY not configured — video generation disabled.");
  }

  // Mark scene as pending
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const sceneIndex = project.scenes?.findIndex((s) => s.id === sceneId) ?? -1;
  if (sceneIndex < 0) throw new Error(`Scene ${sceneId} not found in project`);

  const updatedScenes = [...(project.scenes || [])];
  updatedScenes[sceneIndex] = {
    ...updatedScenes[sceneIndex],
    videoStatus: "pending",
  };
  await updateProject(projectId, { scenes: updatedScenes });

  updateProgress(10);

  // Generate video via fal.ai (with reference images for element consistency)
  const result = await generateSceneVideo({
    prompt,
    durationSec,
    aspectRatio,
    resolution,
    referenceImageUrls,
    imageUrl,
  });

  updateProgress(70);

  // Persist the video to storage
  let persistentUrl: string;
  try {
    persistentUrl = await persistVideo(result.videoUrl, projectId, sceneId);
  } catch (persistErr) {
    // If persistence fails, fall back to the original URL
    console.warn(
      `[video-generation] Failed to persist video, using original URL:`,
      persistErr
    );
    persistentUrl = result.videoUrl;
  }

  updateProgress(90);

  // Update the scene with the persistent URL
  const freshProject = await getProjectById(projectId);
  if (freshProject?.scenes) {
    const freshScenes = [...freshProject.scenes];
    const idx = freshScenes.findIndex((s) => s.id === sceneId);
    if (idx >= 0) {
      freshScenes[idx] = {
        ...freshScenes[idx],
        videoUrl: persistentUrl,
        videoStatus: "ready",
        videoError: undefined,
      } as Scene;
      await updateProject(projectId, { scenes: freshScenes });
    }
  }

  updateProgress(100);

  // Send "video-ready" notification to the project owner
  const owner = freshProject || project;
  const doneScene = owner.scenes?.find((s) => s.id === sceneId);
  const sceneTitle = doneScene?.title || sceneId;
  notify({
    userId: owner.ownerId,
    kind: "video-ready",
    message: `Vidéo générée pour la scène "${sceneTitle}"`,
    href: `/studio/${projectId}`,
    projectId,
  }).catch(() => {});

  return { videoUrl: persistentUrl };
}

/**
 * Error recovery: mark scene as error if the job ultimately fails.
 * This is called from the job queue on final failure.
 */
export function registerVideoGenerationHandler(): void {
  registerHandler(
    "video-generation",
    async (job: Job, updateProgress: (pct: number) => void) => {
      try {
        return await handleVideoGeneration(job, updateProgress);
      } catch (err) {
        // On failure, mark the scene as error
        const { projectId, sceneId } = job.payload as {
          projectId?: string;
          sceneId?: string;
        };
        if (projectId && sceneId) {
          try {
            const project = await getProjectById(projectId);
            if (project?.scenes) {
              const scenes = [...project.scenes];
              const idx = scenes.findIndex((s) => s.id === sceneId);
              if (idx >= 0) {
                scenes[idx] = {
                  ...scenes[idx],
                  videoStatus: "error",
                  videoError:
                    err instanceof Error ? err.message : String(err),
                } as Scene;
                await updateProject(projectId, { scenes });
              }
            }
          } catch {
            // Best-effort error marking
          }
        }
        throw err; // Re-throw so the job queue records the failure
      }
    }
  );
}
