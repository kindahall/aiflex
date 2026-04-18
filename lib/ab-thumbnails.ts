import "server-only";
import { prisma } from "./prisma";

/**
 * A/B thumbnail testing (V8 §23.2).
 *
 * Data model: `Project.thumbnailVariants: Json` holds an array of
 *   { url: string; impressions: number; clicks: number; active?: boolean }
 *
 * Flow:
 *   1. Creator uploads 2-3 variants via /api/projects/{id}/thumbnails
 *   2. For 7 days, `pickThumbnailForImpression` rotates uniformly across
 *      variants each time a catalogue row is rendered (impression++ on pick)
 *   3. When a user clicks a card, the client pings /api/projects/{id}/click
 *      which increments clicks++ on whichever variant was last shown
 *   4. After 7 days, `resolveBestThumbnail` promotes the highest CTR variant
 *      as the project's primary `thumbnailUrl` and clears variants.
 *
 * Intentionally simple: equal-weight rotation, no Thompson sampling. Works
 * at AIflex's expected daily impression volume (< 100k/film).
 */

export interface ThumbnailVariant {
  url: string;
  impressions: number;
  clicks: number;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Selection (called per catalogue card render)
// ---------------------------------------------------------------------------

/**
 * Return the URL to display for a given project. Handles three cases:
 *   - No variants → canonical `thumbnailUrl`
 *   - Variants + within test window → rotate uniformly, increment impressions
 *   - Test already resolved (`active: true` on one variant) → that one
 *
 * Fire-and-forget DB write — the call site shouldn't await.
 */
export async function pickThumbnailForImpression(
  project: {
    id: string;
    thumbnailUrl: string | null;
    thumbnailVariants: unknown;
  }
): Promise<string | null> {
  const variants = parseVariants(project.thumbnailVariants);
  if (variants.length === 0) return project.thumbnailUrl;

  const resolved = variants.find((v) => v.active);
  if (resolved) return resolved.url;

  const idx = Math.floor(Math.random() * variants.length);
  const chosen = variants[idx];

  // Increment impressions in place — best-effort.
  const next = variants.map((v, i) =>
    i === idx ? { ...v, impressions: v.impressions + 1 } : v
  );
  prisma.project
    .update({
      where: { id: project.id },
      data: { thumbnailVariants: next as unknown as object },
    })
    .catch(() => {});

  return chosen.url;
}

// ---------------------------------------------------------------------------
// Tracking (called when a user clicks a catalogue card)
// ---------------------------------------------------------------------------

/**
 * Record a click on the variant matching the URL the user saw. Best-effort,
 * never throws.
 */
export async function recordThumbnailClick(
  projectId: string,
  thumbnailUrl: string
): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { thumbnailVariants: true },
    });
    const variants = parseVariants(project?.thumbnailVariants);
    const idx = variants.findIndex((v) => v.url === thumbnailUrl);
    if (idx === -1) return;
    const next = variants.map((v, i) =>
      i === idx ? { ...v, clicks: v.clicks + 1 } : v
    );
    await prisma.project.update({
      where: { id: projectId },
      data: { thumbnailVariants: next as unknown as object },
    });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Resolution (called by a weekly cron)
// ---------------------------------------------------------------------------

/**
 * Finalize the A/B test for one project by promoting the highest CTR
 * variant. Called by `/api/thumbnails/resolve` (cron). Idempotent.
 */
export async function resolveBestThumbnail(
  projectId: string,
  minImpressions = 100
): Promise<{
  resolved: boolean;
  winnerUrl?: string;
  reason?: string;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { thumbnailVariants: true },
  });
  const variants = parseVariants(project?.thumbnailVariants);
  if (variants.length === 0) return { resolved: false, reason: "no variants" };
  if (variants.some((v) => v.active)) {
    return { resolved: false, reason: "already resolved" };
  }

  const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
  if (totalImpressions < minImpressions) {
    return { resolved: false, reason: "insufficient data" };
  }

  const winner = variants.reduce(
    (best, v) => {
      const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
      return ctr > best.ctr ? { variant: v, ctr } : best;
    },
    { variant: variants[0], ctr: 0 }
  ).variant;

  const next = variants.map((v) => ({ ...v, active: v.url === winner.url }));
  await prisma.project.update({
    where: { id: projectId },
    data: {
      thumbnailUrl: winner.url,
      thumbnailVariants: next as unknown as object,
    },
  });

  return { resolved: true, winnerUrl: winner.url };
}

// ---------------------------------------------------------------------------
// Variant management (used by upload + regenerate endpoints)
// ---------------------------------------------------------------------------

/**
 * Replace the variant list for a project. Resets counters. Used when a
 * creator uploads (or generates via Flux) a new batch.
 */
export async function setThumbnailVariants(
  projectId: string,
  urls: string[]
): Promise<void> {
  const variants: ThumbnailVariant[] = urls.slice(0, 3).map((url) => ({
    url,
    impressions: 0,
    clicks: 0,
  }));
  await prisma.project.update({
    where: { id: projectId },
    data: { thumbnailVariants: variants as unknown as object },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseVariants(raw: unknown): ThumbnailVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (v): v is ThumbnailVariant =>
        !!v &&
        typeof v === "object" &&
        typeof (v as { url?: unknown }).url === "string"
    )
    .map((v) => ({
      url: v.url,
      impressions: Number(v.impressions ?? 0),
      clicks: Number(v.clicks ?? 0),
      active: Boolean(v.active),
    }));
}
