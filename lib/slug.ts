import "server-only";
import { prisma } from "./prisma";

/**
 * URL slug generator for published projects (V8 §27.1 SEO).
 *
 * We keep the id-based URL (`/watch/<id>`) as the canonical, and expose a
 * slug-based alias (`/watch/<slug>-<shortId>`) for SEO — search engines
 * reward human-readable URLs, and the short id suffix guarantees uniqueness
 * without needing retry loops.
 */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Ensure a slug is unique on the `Project.slug` column by appending a short
 * suffix from the project id. Idempotent: passing the same projectId twice
 * returns the same slug.
 */
export async function ensureUniqueSlug(
  title: string,
  projectId: string
): Promise<string> {
  const base = slugify(title) || "film";
  // Use the last 6 chars of the project id — avoids collisions on popular
  // titles, keeps the URL readable. cuid is base36 so no conflict chars.
  const suffix = projectId.slice(-6);
  return `${base}-${suffix}`;
}

/**
 * Resolve a project by either its raw id OR its slug.
 * Returns null if neither matches. Used by /watch/[slug] lookup.
 */
export async function findProjectBySlugOrId(slugOrId: string) {
  // Heuristic: slugs contain a dash, ids (cuid) do not. Still try both
  // paths to stay resilient to title-less projects.
  const byId = await prisma.project.findUnique({ where: { id: slugOrId } });
  if (byId) return byId;
  return prisma.project.findUnique({ where: { slug: slugOrId } });
}
