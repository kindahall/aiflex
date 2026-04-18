/**
 * Unit tests for lib/slug.ts (V8 §27.1 — SEO).
 *
 * Pure functions for slugify + ensureUniqueSlug. The lookup function
 * findProjectBySlugOrId hits Prisma — covered separately.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  project: {
    findUnique: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  mod = await import("@/lib/slug");
});

describe("slugify", () => {
  it("strips diacritics and lowercases", () => {
    expect(mod.slugify("Léa Échappe à L'éVENT")).toBe("lea-echappe-a-levent");
  });

  it("collapses non-alphanum runs to a single dash", () => {
    expect(mod.slugify("Mon film !!! ?? avec  espaces")).toBe(
      "mon-film-avec-espaces"
    );
  });

  it("trims leading and trailing dashes", () => {
    expect(mod.slugify("---hello---")).toBe("hello");
  });

  it("caps to 64 chars", () => {
    const long = "a".repeat(200);
    expect(mod.slugify(long).length).toBe(64);
  });

  it("returns empty string for non-letter input (caller falls back)", () => {
    expect(mod.slugify("@@@@")).toBe("");
    expect(mod.slugify("___")).toBe("");
  });
});

describe("ensureUniqueSlug", () => {
  it("appends the last 6 chars of the project id as a stable suffix", async () => {
    const slug = await mod.ensureUniqueSlug("Mon Super Film", "abc123def456ghi789");
    expect(slug).toBe("mon-super-film-ghi789");
  });

  it("falls back to 'film' when title produces an empty slug", async () => {
    const slug = await mod.ensureUniqueSlug("@@@", "abc123ghi789");
    expect(slug).toBe("film-ghi789");
  });
});

describe("findProjectBySlugOrId", () => {
  it("returns project by id when found on first try", async () => {
    const project = { id: "abc", title: "T", slug: null };
    prismaMock.project.findUnique.mockResolvedValueOnce(project);
    const r = await mod.findProjectBySlugOrId("abc");
    expect(r).toBe(project);
  });

  it("falls back to slug lookup when id misses", async () => {
    const project = { id: "abc", title: "T", slug: "my-film-abcdef" };
    prismaMock.project.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(project);
    const r = await mod.findProjectBySlugOrId("my-film-abcdef");
    expect(r).toBe(project);
    expect(prismaMock.project.findUnique).toHaveBeenCalledTimes(2);
  });

  it("returns null when neither id nor slug match", async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);
    const r = await mod.findProjectBySlugOrId("nope");
    expect(r).toBeNull();
  });
});
