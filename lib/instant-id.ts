import "server-only";
import { prisma } from "./prisma";
import { assertSafeOutboundUrl } from "./safe-fetch";
import { uploadFromUrl, storagePaths } from "./storage";

/**
 * InstantID-driven character continuity (V8 §28.4).
 *
 * Real InstantID requires a H100/A100 — we don't ship that in the agent
 * pipeline. Instead we proxy through Replicate's hosted variant:
 *
 *   zsxkib/instant-id          (face embedding extraction)
 *   zsxkib/instant-id-v2       (image gen conditioned on a face ref)
 *
 * Strategy:
 *   1. When a Character is created with a reference image, call Replicate
 *      to extract a 512-d facial embedding and store it in the
 *      `Character.facialEmbedding` pgvector column.
 *   2. When the agent generates a new film featuring a Character (looked
 *      up by name in the scenario), pass the reference image URL to the
 *      Seedance `referenceImageUrls` payload (already wired in
 *      lib/seedance.ts) so the resulting clip stays visually consistent.
 *   3. Embedding similarity (`<=> 0.3`) is used by the marketplace to
 *      detect "this character looks like an existing public one" and
 *      surface licensing suggestions.
 *
 * Falls back gracefully when REPLICATE_API_TOKEN isn't set.
 */

const REPLICATE_BASE = "https://api.replicate.com/v1";

// Set REPLICATE_INSTANT_ID_MODEL to the pinned version you want to run, e.g.
//   "zsxkib/instant-id:<real-64char-sha>"
// Grab the current sha from https://replicate.com/zsxkib/instant-id/versions.
// Left unset, the extraction gracefully skips (see extractFacialEmbedding).
const INSTANT_ID_MODEL = process.env.REPLICATE_INSTANT_ID_MODEL || "";

const POLL_INTERVAL_MS = 4_000;
const MAX_POLL_MS = 5 * 60 * 1000;

export interface ExtractEmbeddingResult {
  skipped: boolean;
  reason?: string;
  embedding?: number[];
}

/**
 * Extract a 512-dim facial embedding from a reference image. Returns
 * `{ skipped: true }` when Replicate isn't configured.
 */
export async function extractFacialEmbedding(imageUrl: string): Promise<ExtractEmbeddingResult> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    return { skipped: true, reason: "REPLICATE_API_TOKEN not set" };
  }
  if (!INSTANT_ID_MODEL) {
    return {
      skipped: true,
      reason: "REPLICATE_INSTANT_ID_MODEL not set (pin a model version)",
    };
  }

  try {
    await assertSafeOutboundUrl(imageUrl);
  } catch (err) {
    return {
      skipped: true,
      reason: `image URL refused: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  // Submit prediction
  const submitRes = await fetch(`${REPLICATE_BASE}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: INSTANT_ID_MODEL,
      input: {
        image: imageUrl,
        return_embedding: true,
      },
    }),
  });
  if (!submitRes.ok) {
    const text = await submitRes.text();
    return {
      skipped: true,
      reason: `Replicate submit failed (${submitRes.status}): ${text.slice(0, 200)}`,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prediction: any = await submitRes.json();
  const id = prediction.id as string;

  // Poll
  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const r = await fetch(`${REPLICATE_BASE}/predictions/${id}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (!r.ok) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = await r.json();
    if (p.status === "succeeded") {
      // The model returns either a {embedding: number[]} object or
      // an array of floats — accept both.
      const out = Array.isArray(p.output)
        ? p.output
        : (p.output?.embedding ?? p.output?.face_embedding);
      if (
        Array.isArray(out) &&
        out.length >= 256 &&
        out.slice(0, 512).every((n: unknown) => typeof n === "number" && Number.isFinite(n))
      ) {
        return { skipped: false, embedding: out.slice(0, 512) as number[] };
      }
      return {
        skipped: true,
        reason: "Replicate returned no embedding payload",
      };
    }
    if (p.status === "failed" || p.status === "canceled") {
      return {
        skipped: true,
        reason: `Replicate prediction ${p.status}: ${p.error ?? ""}`,
      };
    }
  }
  return { skipped: true, reason: "Replicate poll timed out" };
}

/**
 * Persist the embedding on a Character row via raw SQL (Prisma can't
 * write `vector(512)` directly).
 */
export async function persistCharacterEmbedding(
  characterId: string,
  embedding: number[]
): Promise<void> {
  const vec = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "Character" SET "facialEmbedding" = $1::vector WHERE id = $2`,
    vec,
    characterId
  );
}

/**
 * Convenience: extract + persist + (optional) re-host the reference image
 * in our storage so we don't depend on Replicate's CDN long-term.
 */
export async function backfillCharacterEmbedding(
  characterId: string
): Promise<{ ok: boolean; reason?: string }> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, referenceImageUrl: true },
  });
  if (!character?.referenceImageUrl) {
    return { ok: false, reason: "no reference image" };
  }

  // Make sure the reference image is hosted by us before we feed it to
  // Replicate (avoids hot-link breakage across providers).
  let refUrl = character.referenceImageUrl;
  if (!refUrl.startsWith(process.env.S3_PUBLIC_URL ?? "https://cdn.aiflex.app")) {
    try {
      refUrl = await uploadFromUrl(
        refUrl,
        storagePaths.characterReference(characterId),
        "image/webp"
      );
      await prisma.character.update({
        where: { id: characterId },
        data: { referenceImageUrl: refUrl },
      });
    } catch {
      /* best-effort */
    }
  }

  const result = await extractFacialEmbedding(refUrl);
  if (result.skipped || !result.embedding) {
    return { ok: false, reason: result.reason };
  }

  await persistCharacterEmbedding(characterId, result.embedding);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Similarity lookup — used by the marketplace "this looks like X" hint
// ---------------------------------------------------------------------------

export interface SimilarCharacter {
  characterId: string;
  name: string;
  creatorId: string;
  distance: number;
}

/**
 * Find public characters whose facialEmbedding is close to `embedding`.
 * Cosine distance threshold tunable; default 0.3 = "very similar look".
 */
export async function findSimilarPublicCharacters(
  embedding: number[],
  options: { limit?: number; maxDistance?: number } = {}
): Promise<SimilarCharacter[]> {
  const limit = options.limit ?? 5;
  const maxDistance = options.maxDistance ?? 0.3;
  const vec = `[${embedding.join(",")}]`;
  type Row = {
    id: string;
    name: string;
    creatorId: string;
    distance: number;
  };
  const rows = await prisma
    .$queryRawUnsafe<Row[]>(
      `SELECT id, name, "creatorId",
              "facialEmbedding" <=> $1::vector AS distance
       FROM "Character"
       WHERE public = true
         AND "facialEmbedding" IS NOT NULL
         AND ("facialEmbedding" <=> $1::vector) <= $2
       ORDER BY distance ASC
       LIMIT $3`,
      vec,
      maxDistance,
      limit
    )
    .catch(() => [] as Row[]);
  return rows.map((r) => ({
    characterId: r.id,
    name: r.name,
    creatorId: r.creatorId,
    distance: Number(r.distance),
  }));
}
