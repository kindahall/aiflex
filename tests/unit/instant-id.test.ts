/**
 * Unit tests for lib/instant-id.ts (V8 §28.4).
 *
 * Validates: graceful degradation when REPLICATE_API_TOKEN missing,
 * embedding shape parsing, similarity threshold filter.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  $queryRawUnsafe: (...a: unknown[]) => Promise<unknown[]>;
  $executeRawUnsafe: (...a: unknown[]) => Promise<number>;
  character: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
    update: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/storage", () => ({
  uploadFromUrl: vi.fn(async (url: string) => url),
  storagePaths: { characterReference: (id: string) => `characters/${id}/ref.webp` },
}));
vi.mock("@/lib/safe-fetch", () => ({
  assertSafeOutboundUrl: vi.fn(async (u: string) => new URL(u)),
}));

const ENV_BACKUP = process.env.REPLICATE_API_TOKEN;
const MODEL_BACKUP = process.env.REPLICATE_INSTANT_ID_MODEL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  // Default: a pinned model, so most tests exercise the fetch path.
  process.env.REPLICATE_INSTANT_ID_MODEL = "zsxkib/instant-id:test-version";
  mod = await import("@/lib/instant-id");
});

afterEach(() => {
  if (ENV_BACKUP === undefined) delete process.env.REPLICATE_API_TOKEN;
  else process.env.REPLICATE_API_TOKEN = ENV_BACKUP;
  if (MODEL_BACKUP === undefined) delete process.env.REPLICATE_INSTANT_ID_MODEL;
  else process.env.REPLICATE_INSTANT_ID_MODEL = MODEL_BACKUP;
  vi.unstubAllGlobals();
});

describe("extractFacialEmbedding", () => {
  it("returns skipped when REPLICATE_API_TOKEN is missing", async () => {
    delete process.env.REPLICATE_API_TOKEN;
    const r = await mod.extractFacialEmbedding("https://x/img.png");
    expect(r.skipped).toBe(true);
    expect(r.reason).toMatch(/REPLICATE_API_TOKEN/);
    expect(r.embedding).toBeUndefined();
  });

  it("returns skipped when REPLICATE_INSTANT_ID_MODEL is not pinned", async () => {
    process.env.REPLICATE_API_TOKEN = "tok_x";
    delete process.env.REPLICATE_INSTANT_ID_MODEL;
    vi.resetModules();
    const fresh = await import("@/lib/instant-id");
    const r = await fresh.extractFacialEmbedding("https://x/img.png");
    expect(r.skipped).toBe(true);
    expect(r.reason).toMatch(/REPLICATE_INSTANT_ID_MODEL/);
  });

  it("returns skipped on Replicate submit failure", async () => {
    process.env.REPLICATE_API_TOKEN = "tok_x";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "boom",
      })
    );
    const r = await mod.extractFacialEmbedding("https://x/img.png");
    expect(r.skipped).toBe(true);
    expect(r.reason).toMatch(/Replicate submit failed/);
  });
});

describe("findSimilarPublicCharacters", () => {
  it("forwards limit + maxDistance + cosine vector to raw query", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
      { id: "c_1", name: "Lara", creatorId: "u_1", distance: 0.12 },
      { id: "c_2", name: "Other", creatorId: "u_2", distance: 0.18 },
    ]);
    const matches = await mod.findSimilarPublicCharacters(Array(512).fill(0.1), {
      limit: 3,
      maxDistance: 0.2,
    });
    expect(matches.length).toBe(2);
    expect(matches[0].name).toBe("Lara");
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args?.[2]).toBe(0.2); // maxDistance threshold
    expect(args?.[3]).toBe(3); // limit
  });

  it("returns empty array on raw-query failure (pgvector missing)", async () => {
    prismaMock.$queryRawUnsafe.mockRejectedValueOnce(new Error("no extension"));
    const matches = await mod.findSimilarPublicCharacters([1, 2, 3]);
    expect(matches).toEqual([]);
  });
});

describe("backfillCharacterEmbedding", () => {
  it("returns ok:false when character has no reference image", async () => {
    prismaMock.character.findUnique.mockResolvedValueOnce({
      id: "c_1",
      referenceImageUrl: null,
    });
    const r = await mod.backfillCharacterEmbedding("c_1");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no reference image/);
  });
});
