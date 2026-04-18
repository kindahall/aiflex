import "server-only";
import { prisma } from "./prisma";

/**
 * Daily API usage tracking (V8 §25.8).
 *
 * Each model provider lib (lib/seedance, lib/flux, lib/ai-client,
 * lib/voice-cloning, lib/subtitles-whisper) calls `bumpUsage()` after a
 * successful call. The `/account/usage` page reads the current month's
 * counters; the cron `retention-purge` doesn't touch this table — it's
 * not personal data, just operational counters with no IP.
 *
 * Best-effort: failures here NEVER bubble. The provider call itself is
 * what matters; usage tracking is observability, not transactional.
 */

export type UsageKind =
  | "claudeTokens"
  | "openaiTokens"
  | "fluxImages"
  | "seedanceSeconds"
  | "whisperMinutes"
  | "elevenLabsChars";

export async function bumpUsage(
  userId: string,
  kind: UsageKind,
  amount: number
): Promise<void> {
  if (amount <= 0) return;
  const date = todayUtcMidnight();
  try {
    await prisma.dailyApiUsage.upsert({
      where: { userId_date: { userId, date } },
      update: { [kind]: { increment: amount } },
      create: {
        userId,
        date,
        [kind]: amount,
      },
    });
  } catch {
    // never throw — instrumentation must not impact the user-facing call
  }
}

export interface MonthlyUsage {
  month: string; // YYYY-MM
  claudeTokens: number;
  openaiTokens: number;
  fluxImages: number;
  seedanceSeconds: number;
  whisperMinutes: number;
  elevenLabsChars: number;
  perDay: Array<{
    date: string;
    claudeTokens: number;
    openaiTokens: number;
    fluxImages: number;
    seedanceSeconds: number;
    whisperMinutes: number;
    elevenLabsChars: number;
  }>;
}

export async function getMonthlyUsage(
  userId: string,
  monthStart: Date = monthStartUtc(new Date())
): Promise<MonthlyUsage> {
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const rows = await prisma.dailyApiUsage.findMany({
    where: {
      userId,
      date: { gte: monthStart, lt: monthEnd },
    },
    orderBy: { date: "asc" },
  });

  const totals = {
    claudeTokens: 0,
    openaiTokens: 0,
    fluxImages: 0,
    seedanceSeconds: 0,
    whisperMinutes: 0,
    elevenLabsChars: 0,
  };
  for (const r of rows) {
    totals.claudeTokens += r.claudeTokens;
    totals.openaiTokens += r.openaiTokens;
    totals.fluxImages += r.fluxImages;
    totals.seedanceSeconds += r.seedanceSeconds;
    totals.whisperMinutes += r.whisperMinutes;
    totals.elevenLabsChars += r.elevenLabsChars;
  }

  return {
    month: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`,
    ...totals,
    perDay: rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      claudeTokens: r.claudeTokens,
      openaiTokens: r.openaiTokens,
      fluxImages: r.fluxImages,
      seedanceSeconds: r.seedanceSeconds,
      whisperMinutes: r.whisperMinutes,
      elevenLabsChars: r.elevenLabsChars,
    })),
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayUtcMidnight(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
