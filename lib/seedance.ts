import { fal } from "@fal-ai/client";
import { assertSafeOutboundUrl } from "./safe-fetch";
import { getSettings } from "./server-db";

/**
 * Seedance 2 Pro (ByteDance) — hosted on fal.ai.
 * Text-to-video generation for each scene of an AIflex project.
 *
 * We only configure the client once. If no FAL_KEY is set in the environment,
 * the app gracefully degrades to using a cinematic still image placeholder
 * (see /api/scene-video route).
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

export function hasSeedanceKey(): boolean {
  return Boolean(process.env.FAL_KEY);
}

async function assertParamUrlsSafe(params: SeedanceParams): Promise<void> {
  if (params.imageUrl) await assertSafeOutboundUrl(params.imageUrl);
  if (params.referenceImageUrls?.length) {
    for (const u of params.referenceImageUrls) {
      await assertSafeOutboundUrl(u);
    }
  }
}

// fal.subscribe holds a WebSocket open until the job finishes — without
// a hard wall a hung fal worker keeps our request handler alive past the
// serverless/platform timeout and leaks connections. The caller can tune
// via FAL_SUBSCRIBE_TIMEOUT_MS; default sits under Vercel's 300s Pro cap.
const FAL_SUBSCRIBE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.FAL_SUBSCRIBE_TIMEOUT_MS || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 4 * 60 * 1000;
})();

async function withFalTimeout<T>(op: () => Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`fal.${label} a dépassé ${FAL_SUBSCRIBE_TIMEOUT_MS}ms — génération abandonnée`)
        ),
      FAL_SUBSCRIBE_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([op(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface SeedanceParams {
  prompt: string;
  durationSec?: number; // 5..10
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "480p" | "720p" | "1080p";
  seed?: number;
  /** Reference image URLs for character/element consistency (Kling Elements, Seedance refs). */
  referenceImageUrls?: string[];
  /** Single image URL for image-to-video mode. */
  imageUrl?: string;
}

export interface SeedanceResult {
  videoUrl: string;
  seed?: number;
}

/**
 * Call the configured text-to-video model via fal.ai.
 *
 * The admin dashboard can switch between Seedance 2 Pro (default), Seedance 1,
 * Veo 3, Kling, Hailuo, Luma etc. The `videoModel` setting is read from the DB
 * at call time, so switches are effective on the next generation without a
 * redeploy. `SEEDANCE_MODEL` env var is honored as a final override.
 */
export async function generateSceneVideo(params: SeedanceParams): Promise<SeedanceResult> {
  ensureConfigured();
  await assertParamUrlsSafe(params);

  const settings = await getSettings();
  const model =
    process.env.SEEDANCE_MODEL ||
    settings.videoModel ||
    "fal-ai/bytedance/seedance/v2/pro/text-to-video";

  // Build the input payload with optional reference images for
  // character/element consistency (similar to Kling Elements).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: Record<string, any> = {
    prompt: params.prompt,
    duration: String(params.durationSec ?? 8),
    aspect_ratio: params.aspectRatio ?? "16:9",
    resolution: params.resolution ?? "720p",
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
  };

  // Single image for image-to-video mode
  if (params.imageUrl) {
    input.image_url = params.imageUrl;
  }

  // Reference images for character/element consistency.
  // Different models use different parameter names:
  // - Seedance v2: "reference_images" (array of URLs, up to 9)
  // - Kling v2: "subject_reference" (single URL or array)
  // - Veo 3 / Hailuo / Luma: "image_url" (single reference)
  if (params.referenceImageUrls?.length) {
    const refs = params.referenceImageUrls;
    if (model.includes("seedance")) {
      // Seedance accepts an array of reference image objects
      input.reference_images = refs.map((url) => ({ image_url: url }));
    } else if (model.includes("kling")) {
      // Kling Elements: subject_reference for character consistency
      input.subject_reference = refs.map((url) => ({ image_url: url }));
    } else {
      // Generic fallback: most models accept image_url for single ref
      if (!input.image_url && refs[0]) {
        input.image_url = refs[0];
      }
    }
  }

  // fal.subscribe waits for the job to finish and streams progress logs.
  // Wrapped in the outbound limiter + circuit breaker — a runaway
  // generation bug could otherwise saturate our fal.ai quota and
  // balloon the bill, and a fal outage would otherwise let request
  // queues pile up indefinitely.
  const { withOutboundLimit } = await import("./outbound-limit");
  const { withCircuitBreaker } = await import("./circuit-breaker");
  const result = await withCircuitBreaker("fal", () =>
    withOutboundLimit("fal", () =>
      withFalTimeout(
        () =>
          fal.subscribe(model, {
            input,
            logs: false,
          }),
        "subscribe"
      )
    )
  );

  // fal.ai response shape: { data: { video: { url: string } } }
  // We defensively walk a couple of common shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = (result as any)?.data ?? result;
  const videoUrl: string | undefined =
    data?.video?.url || data?.output?.video?.url || data?.videos?.[0]?.url || data?.url;

  if (!videoUrl) {
    throw new Error("Seedance 2 n'a pas retourné d'URL vidéo. Réponse inattendue.");
  }

  return {
    videoUrl,
    seed: typeof data?.seed === "number" ? data.seed : undefined,
  };
}

// ---------------------------------------------------------------------------
// Async queue mode — submit a batch of scenes then poll (V7 §6.2 pipeline)
// ---------------------------------------------------------------------------

export interface SeedanceQueueHandle {
  requestId: string;
  model: string;
}

/**
 * Enqueue a scene generation without waiting. Returns a handle that can be
 * polled with `getSceneVideoStatus` and resolved with `getSceneVideoResult`.
 *
 * Use for long-form content where sequential `generateSceneVideo` calls
 * would hold a Node process open for hours. A cron or worker can poll
 * completion and run Remotion render once all scenes return.
 */
export async function submitSceneVideo(params: SeedanceParams): Promise<SeedanceQueueHandle> {
  ensureConfigured();
  await assertParamUrlsSafe(params);
  const settings = await getSettings();
  const model =
    process.env.SEEDANCE_MODEL ||
    settings.videoModel ||
    "fal-ai/bytedance/seedance/v2/pro/text-to-video";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: Record<string, any> = {
    prompt: params.prompt,
    duration: String(params.durationSec ?? 8),
    aspect_ratio: params.aspectRatio ?? "16:9",
    resolution: params.resolution ?? "720p",
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
  };
  if (params.imageUrl) input.image_url = params.imageUrl;
  if (params.referenceImageUrls?.length) {
    const refs = params.referenceImageUrls;
    if (model.includes("seedance")) {
      input.reference_images = refs.map((url) => ({ image_url: url }));
    } else if (model.includes("kling")) {
      input.subject_reference = refs.map((url) => ({ image_url: url }));
    } else if (!input.image_url && refs[0]) {
      input.image_url = refs[0];
    }
  }

  const { request_id } = await fal.queue.submit(model, { input });
  return { requestId: request_id, model };
}

export type SeedanceJobStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "ERROR";

export async function getSceneVideoStatus(handle: SeedanceQueueHandle): Promise<SeedanceJobStatus> {
  ensureConfigured();
  const status = await fal.queue.status(handle.model, {
    requestId: handle.requestId,
    logs: false,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((status as any)?.status as SeedanceJobStatus) ?? "IN_PROGRESS";
}

/**
 * Fetch the final result once status === "COMPLETED". Throws otherwise.
 */
export async function getSceneVideoResult(handle: SeedanceQueueHandle): Promise<SeedanceResult> {
  ensureConfigured();
  const result = await fal.queue.result(handle.model, {
    requestId: handle.requestId,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = (result as any)?.data ?? result;
  const videoUrl: string | undefined =
    data?.video?.url || data?.output?.video?.url || data?.videos?.[0]?.url || data?.url;
  if (!videoUrl) {
    throw new Error("Seedance queue result did not include a video URL.");
  }
  return {
    videoUrl,
    seed: typeof data?.seed === "number" ? data.seed : undefined,
  };
}
