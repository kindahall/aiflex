import "server-only";
import { prisma } from "./prisma";

/**
 * Daily analytics aggregator (V8 §23.1).
 *
 * Walks every FilmView / CreatorPayout of the previous day (UTC) and
 * materialises a `DailyFilmStats` row per (project, day). The creator
 * dashboard queries these aggregates rather than the raw tables so the
 * page stays fast even after months of traffic.
 *
 * Idempotent via the unique `(projectId, date)` index — safe to re-run.
 */

export interface DailyAggregatorResult {
  date: string; // ISO date (YYYY-MM-DD)
  projectsUpdated: number;
  totalViews: number;
  totalRevenueCents: number;
}

/**
 * Aggregate views + revenue for a given UTC day (defaults to yesterday).
 * Returns a summary the cron can log.
 */
export async function aggregateDaily(
  day?: Date
): Promise<DailyAggregatorResult> {
  const targetDay = dayAtUtcMidnight(day ?? new Date(Date.now() - 24 * 60 * 60 * 1000));
  const nextDay = new Date(targetDay.getTime() + 24 * 60 * 60 * 1000);

  // 1. Views per project for this day
  const viewGroups = await prisma.filmView.groupBy({
    by: ["projectId"],
    where: {
      watchedAt: { gte: targetDay, lt: nextDay },
      projectId: { not: null },
    },
    _count: { _all: true },
    _sum: { percentageWatched: true },
  });

  // Unique viewers per project (count distinct userId)
  // Prisma doesn't support `distinct` inside groupBy; fall back to raw query
  type UniqueRow = { projectId: string; unique_viewers: bigint };
  const uniqueRows = await prisma.$queryRaw<UniqueRow[]>`
    SELECT "projectId", COUNT(DISTINCT "userId") AS unique_viewers
    FROM "FilmView"
    WHERE "watchedAt" >= ${targetDay}
      AND "watchedAt" < ${nextDay}
      AND "projectId" IS NOT NULL
    GROUP BY "projectId"
  `;
  const uniqueMap = new Map<string, number>();
  for (const row of uniqueRows) {
    uniqueMap.set(row.projectId, Number(row.unique_viewers));
  }

  // 2. Revenue per project from CreatorPayout rows attributed to this month
  //   (we bucket revenue by month, not by day — daily revenue is implicit
  //   in the monthly CreatorPayout row. We pro-rate the month total across
  //   the number of days that have view activity so the daily chart shows
  //   something more informative than zeros)
  const monthKey = `${targetDay.getUTCFullYear()}-${String(targetDay.getUTCMonth() + 1).padStart(2, "0")}`;
  const payouts = await prisma.creatorPayout.findMany({
    where: { month: monthKey, projectId: { in: viewGroups.map((v) => v.projectId!) } },
    select: { projectId: true, netAmount: true },
  });
  const revenueByProject = new Map<string, number>();
  for (const p of payouts) {
    if (!p.projectId) continue;
    revenueByProject.set(
      p.projectId,
      (revenueByProject.get(p.projectId) ?? 0) + p.netAmount
    );
  }
  // Proportional daily slice
  const daysInMonth = new Date(
    targetDay.getUTCFullYear(),
    targetDay.getUTCMonth() + 1,
    0
  ).getUTCDate();

  // 3. Write DailyFilmStats rows
  let totalViews = 0;
  let totalRevenueCents = 0;
  let projectsUpdated = 0;

  for (const group of viewGroups) {
    if (!group.projectId) continue;
    const views = group._count._all;
    const sumPct = group._sum.percentageWatched ?? 0;
    const avg = views > 0 ? sumPct / views : 0;
    const monthRevenue = revenueByProject.get(group.projectId) ?? 0;
    const dailyRevenue = Math.round(monthRevenue / daysInMonth);

    await prisma.dailyFilmStats.upsert({
      where: {
        projectId_date: {
          projectId: group.projectId,
          date: targetDay,
        },
      },
      update: {
        views,
        uniqueViewers: uniqueMap.get(group.projectId) ?? views,
        avgCompletion: avg,
        revenueCents: dailyRevenue,
      },
      create: {
        projectId: group.projectId,
        date: targetDay,
        views,
        uniqueViewers: uniqueMap.get(group.projectId) ?? views,
        avgCompletion: avg,
        revenueCents: dailyRevenue,
      },
    });

    totalViews += views;
    totalRevenueCents += dailyRevenue;
    projectsUpdated++;
  }

  return {
    date: targetDay.toISOString().slice(0, 10),
    projectsUpdated,
    totalViews,
    totalRevenueCents,
  };
}

// ---------------------------------------------------------------------------
// Query helpers for /dashboard/analytics
// ---------------------------------------------------------------------------

export interface ProjectAnalyticsSummary {
  project: {
    id: string;
    title: string | null;
    thumbnailUrl: string | null;
    views: number;
    likes: number;
    status: string;
    visibility: string;
    createdAt: Date;
  };
  last30Days: Array<{
    date: string;
    views: number;
    uniqueViewers: number;
    avgCompletion: number;
    revenueCents: number;
  }>;
  totals: {
    views: number;
    uniqueViewers: number;
    avgCompletion: number;
    revenueCents: number;
  };
}

export async function getProjectAnalytics(
  projectId: string,
  requesterId: string
): Promise<ProjectAnalyticsSummary | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      ownerId: true,
      title: true,
      thumbnailUrl: true,
      coverUrl: true,
      views: true,
      likes: true,
      status: true,
      visibility: true,
      createdAt: true,
    },
  });
  if (!project) return null;
  if (project.ownerId !== requesterId) return null;

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  cutoff.setUTCHours(0, 0, 0, 0);

  const stats = await prisma.dailyFilmStats.findMany({
    where: {
      projectId,
      date: { gte: cutoff },
    },
    orderBy: { date: "asc" },
  });

  const last30Days = stats.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    views: s.views,
    uniqueViewers: s.uniqueViewers,
    avgCompletion: s.avgCompletion,
    revenueCents: s.revenueCents,
  }));

  const totals = last30Days.reduce(
    (acc, d) => {
      acc.views += d.views;
      acc.uniqueViewers += d.uniqueViewers;
      acc.revenueCents += d.revenueCents;
      acc.completionSum += d.avgCompletion * d.views;
      return acc;
    },
    { views: 0, uniqueViewers: 0, revenueCents: 0, completionSum: 0 }
  );

  return {
    project: {
      id: project.id,
      title: project.title,
      thumbnailUrl: project.thumbnailUrl,
      views: project.views,
      likes: project.likes,
      status: project.status,
      visibility: project.visibility,
      createdAt: project.createdAt,
    },
    last30Days,
    totals: {
      views: totals.views,
      uniqueViewers: totals.uniqueViewers,
      avgCompletion: totals.views > 0 ? totals.completionSum / totals.views : 0,
      revenueCents: totals.revenueCents,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dayAtUtcMidnight(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}
