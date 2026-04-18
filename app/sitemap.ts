import type { MetadataRoute } from "next";
import { listPublicProjects, listUsers } from "@/lib/server-db";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://aiflex.app";

/**
 * Sitemap (V8 §27.1). Covers marketing, all 9 legal pages, every public
 * project (AI + upload), every public series, and creator profiles.
 * Gracefully degrades if the DB is unavailable — never 500s.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/trending`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/creators`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/library`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
  ];

  // All 9 legal pages (V8 §26.1)
  const LEGAL_SLUGS = [
    "terms",
    "privacy",
    "ai-disclosure",
    "cgv",
    "cookies",
    "dmca",
    "creator-terms",
    "community-guidelines",
    "imprint",
  ];
  const legalPages: MetadataRoute.Sitemap = LEGAL_SLUGS.map((slug) => ({
    url: `${BASE_URL}/legal/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.3,
  }));

  // Public projects — JSON-backed (legacy)
  let projectPages: MetadataRoute.Sitemap = [];
  try {
    const projects = await listPublicProjects();
    projectPages = projects.map((p) => ({
      url: `${BASE_URL}/watch/${p.id}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    /* ignore */
  }

  // Public projects — Prisma-backed, prefer slug URL when available
  try {
    const prismaProjects = await prisma.project.findMany({
      where: {
        published: true,
        visibility: "public",
        status: "ready",
        slug: { not: null },
      },
      select: { slug: true, updatedAt: true },
      take: 10_000,
    });
    for (const p of prismaProjects) {
      if (!p.slug) continue;
      projectPages.push({
        url: `${BASE_URL}/watch/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "weekly",
        priority: 0.85,
      });
    }
  } catch {
    /* ignore — Prisma unavailable */
  }

  // Public series
  let seriesPages: MetadataRoute.Sitemap = [];
  try {
    const series = await prisma.series.findMany({
      where: { visibility: "public", status: "ready" },
      select: { id: true, updatedAt: true },
      take: 5_000,
    });
    seriesPages = series.map((s) => ({
      url: `${BASE_URL}/watch/series/${s.id}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly",
      priority: 0.75,
    }));
  } catch {
    /* ignore */
  }

  // Public creator profiles
  let profilePages: MetadataRoute.Sitemap = [];
  try {
    const users = await listUsers();
    profilePages = users
      .filter((u) => !u.suspended)
      .map((u) => ({
        url: `${BASE_URL}/u/${u.id}`,
        lastModified: new Date(u.createdAt),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
  } catch {
    /* ignore */
  }

  return [
    ...staticPages,
    ...legalPages,
    ...projectPages,
    ...seriesPages,
    ...profilePages,
  ];
}
