import "server-only";
import { fal } from "@fal-ai/client";
import { storagePaths, uploadFromUrl } from "./storage";

/**
 * Flux Schnell (Black Forest Labs) via fal.ai — fast, low-cost character
 * portrait generation used by the assisted creation agent (V7 §6.2).
 *
 * Why Flux Schnell rather than a heavier model:
 *  - ~$0.003/image, ~1s per image → viable for 3 chars × 3 variants/film
 *  - 2:3 portrait aspect is a good match for character reference sheets
 *  - Fallback behavior: if no FAL key is available, the helpers throw so
 *    the caller can surface a clear error rather than spending API budget
 *    with a misconfigured client.
 *
 * Generated URLs from fal.ai are GC'd after ~24-72h, so we immediately
 * re-upload to our own storage via `uploadFromUrl` before returning.
 */

let configuredKey = "";

function ensureConfigured() {
  const key = process.env.FAL_KEY || "";
  if (!key) {
    throw new Error("FAL_KEY manquant — définis-le dans .env.local.");
  }
  if (configuredKey !== key) {
    fal.config({ credentials: key });
    configuredKey = key;
  }
}

export interface FluxImageParams {
  prompt: string;
  numImages?: number; // default 1
  aspectRatio?: "1:1" | "2:3" | "3:2" | "16:9" | "9:16";
  seed?: number;
}

export interface FluxImageResult {
  url: string; // external (fal) URL
  seed?: number;
}

const DEFAULT_MODEL = "fal-ai/flux/schnell";

/**
 * Generate a single batch of images via Flux Schnell and return the raw
 * external URLs. Prefer `generateCharacterImages` when you want persistence.
 */
export async function generateFluxImages(params: FluxImageParams): Promise<FluxImageResult[]> {
  ensureConfigured();
  const model = process.env.FLUX_MODEL || DEFAULT_MODEL;

  const { withOutboundLimit } = await import("./outbound-limit");
  const { withCircuitBreaker } = await import("./circuit-breaker");
  const result = await withCircuitBreaker("fal", () =>
    withOutboundLimit("fal", () =>
      fal.subscribe(model, {
        input: {
          prompt: `Cinematic, high-quality, detailed portrait. ${params.prompt}`,
          num_images: params.numImages ?? 1,
          image_size: aspectToImageSize(params.aspectRatio ?? "2:3"),
          ...(params.seed !== undefined ? { seed: params.seed } : {}),
          enable_safety_checker: true,
          output_format: "webp",
        },
        logs: false,
      })
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = (result as any)?.data ?? result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const images: any[] = data?.images ?? data?.output?.images ?? [];
  if (!images.length) {
    throw new Error("Flux returned no images.");
  }
  return images.map((img) => ({
    url: img.url || img,
    seed: typeof data?.seed === "number" ? data.seed : undefined,
  }));
}

/**
 * Generate `count` character portrait variants, persist each to our storage,
 * and return the resulting public URLs. Used by the assisted agent to show
 * the user a character preview before spending video budget.
 */
export async function generateCharacterImages(
  prompt: string,
  jobId: string,
  count = 3
): Promise<string[]> {
  const batch = await generateFluxImages({
    prompt,
    numImages: count,
    aspectRatio: "2:3",
  });

  return Promise.all(
    batch.map((img, i) =>
      uploadFromUrl(img.url, storagePaths.characterPreview(jobId, i), "image/webp")
    )
  );
}

/**
 * Single-thumbnail generation: used for AI-suggested film thumbnails (V8 §23.3).
 * Aspect ratio 16:9 for catalogue cards.
 */
export async function generateThumbnail(prompt: string, projectId: string): Promise<string> {
  const [img] = await generateFluxImages({
    prompt: `Movie poster, cinematic thumbnail. ${prompt}`,
    numImages: 1,
    aspectRatio: "16:9",
  });
  return uploadFromUrl(img.url, storagePaths.filmThumbnail(projectId), "image/webp");
}

/**
 * Store a character reference image permanently (V10.4 — continuité perso).
 */
export async function saveCharacterReference(prompt: string, characterId: string): Promise<string> {
  const [img] = await generateFluxImages({
    prompt,
    numImages: 1,
    aspectRatio: "2:3",
  });
  return uploadFromUrl(img.url, storagePaths.characterReference(characterId), "image/webp");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aspectToImageSize(ar: "1:1" | "2:3" | "3:2" | "16:9" | "9:16"): string {
  // Flux Schnell accepts named sizes. Map our aspect ratios to the closest
  // supported preset — fal.ai will error on unrecognized values.
  switch (ar) {
    case "1:1":
      return "square_hd";
    case "2:3":
      return "portrait_4_3";
    case "3:2":
      return "landscape_4_3";
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
  }
}

export function hasFluxKey(): boolean {
  return Boolean(process.env.FAL_KEY);
}
