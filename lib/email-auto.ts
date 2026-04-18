import "server-only";
import { prisma } from "./prisma";
import { sendEmail } from "./email";

/**
 * Auto email sequences (V8 §27.4).
 *
 * Three categories, all driven by the daily cron `/api/cron/email-auto`:
 *
 *   - Onboarding   : D0 / D1 / D3 / D7 after signup
 *   - Reactivation : ping users with no activity for 14 days
 *   - Monthly recap: 1st of each month, send creators a stats summary
 *
 * Newsletter consent is enforced once at the gate; we never send a
 * marketing email to a user who hasn't accepted (latest ConsentRecord of
 * type "newsletter" must be `accepted=true`).
 *
 * Idempotency: every send is keyed by a `(kind, userId, periodKey)` set
 * stored in-memory for the process lifetime. For production, this should
 * persist to a `EmailLog` table; we keep it light here so the flow is
 * exercisable without a migration.
 */

export type AutoEmailKind =
  | "onboarding_d0"
  | "onboarding_d1"
  | "onboarding_d3"
  | "onboarding_d7"
  | "reactivation_14d"
  | "monthly_recap";

interface SequenceResult {
  kind: AutoEmailKind;
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
}

// In-memory dedup. Survives within a worker process — fine for daily
// cron + fresh-key-per-day strategy below.
const sentKeys = new Set<string>();

// ---------------------------------------------------------------------------
// Public sequence runners
// ---------------------------------------------------------------------------

/**
 * Send the right onboarding email to every user whose signup age in days
 * matches one of {0, 1, 3, 7}. Caller passes "today" so tests can run
 * deterministically.
 */
export async function runOnboardingSequence(
  today: Date = new Date()
): Promise<SequenceResult[]> {
  const cohorts: Array<{ kind: AutoEmailKind; daysAgo: number }> = [
    { kind: "onboarding_d0", daysAgo: 0 },
    { kind: "onboarding_d1", daysAgo: 1 },
    { kind: "onboarding_d3", daysAgo: 3 },
    { kind: "onboarding_d7", daysAgo: 7 },
  ];
  const results: SequenceResult[] = [];
  for (const cohort of cohorts) {
    results.push(await runOnboardingCohort(cohort.kind, cohort.daysAgo, today));
  }
  return results;
}

async function runOnboardingCohort(
  kind: AutoEmailKind,
  daysAgo: number,
  today: Date
): Promise<SequenceResult> {
  const start = startOfDay(addDays(today, -daysAgo));
  const end = addDays(start, 1);

  const users = await prisma.user.findMany({
    where: {
      suspended: false,
      emailVerified: true,
      createdAt: { gte: start, lt: end },
    },
    select: { id: true, email: true, name: true },
    take: 1000,
  });

  const optedIn = await filterByNewsletterConsent(users);
  const result: SequenceResult = {
    kind,
    considered: optedIn.length,
    sent: 0,
    skipped: users.length - optedIn.length,
    failed: 0,
  };
  const periodKey = `${kind}:${start.toISOString().slice(0, 10)}`;

  for (const u of optedIn) {
    const dedup = `${periodKey}:${u.id}`;
    if (sentKeys.has(dedup)) {
      result.skipped++;
      continue;
    }
    try {
      const { subject, text } = composeOnboarding(kind, u.name);
      await sendEmail({ to: u.email, subject, text });
      sentKeys.add(dedup);
      result.sent++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

/**
 * Reactivation: nudge users whose latest FilmView is older than 14 days.
 * Only sends once per (user, ISO week) so we don't spam.
 */
export async function runReactivationSequence(
  today: Date = new Date()
): Promise<SequenceResult> {
  const cutoff = addDays(today, -14);
  const inactive = await prisma.user.findMany({
    where: {
      suspended: false,
      emailVerified: true,
    },
    select: { id: true, email: true, name: true },
    take: 5_000,
  });

  // Find users WITH activity in the cutoff window, then exclude
  const recent = await prisma.filmView.findMany({
    where: { watchedAt: { gte: cutoff } },
    select: { userId: true },
    distinct: ["userId"],
    take: 50_000,
  });
  const activeIds = new Set(recent.map((r) => r.userId));
  const inactiveOnly = inactive.filter((u) => !activeIds.has(u.id));

  const optedIn = await filterByNewsletterConsent(inactiveOnly);
  const result: SequenceResult = {
    kind: "reactivation_14d",
    considered: optedIn.length,
    sent: 0,
    skipped: inactiveOnly.length - optedIn.length,
    failed: 0,
  };
  const periodKey = `reactivation:${isoWeek(today)}`;

  for (const u of optedIn) {
    const dedup = `${periodKey}:${u.id}`;
    if (sentKeys.has(dedup)) {
      result.skipped++;
      continue;
    }
    try {
      const { subject, text } = composeReactivation(u.name);
      await sendEmail({ to: u.email, subject, text });
      sentKeys.add(dedup);
      result.sent++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

/**
 * Monthly recap: on the 1st of each month, summarise the previous month's
 * earnings for every creator that earned > $0.
 */
export async function runMonthlyRecap(
  today: Date = new Date()
): Promise<SequenceResult> {
  const monthKey = previousMonthKey(today);
  const periodKey = `recap:${monthKey}`;

  const payouts = await prisma.creatorPayout.groupBy({
    by: ["userId"],
    where: { month: monthKey },
    _sum: { netAmount: true },
    orderBy: { userId: "asc" },
    take: 5_000,
  });
  const ids = payouts.map((p) => p.userId);
  if (!ids.length) {
    return {
      kind: "monthly_recap",
      considered: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, suspended: false, emailVerified: true },
    select: { id: true, email: true, name: true },
  });
  const optedIn = await filterByNewsletterConsent(users);
  const totalsByUser = new Map(
    payouts.map((p) => [p.userId, p._sum.netAmount ?? 0])
  );

  const result: SequenceResult = {
    kind: "monthly_recap",
    considered: optedIn.length,
    sent: 0,
    skipped: users.length - optedIn.length,
    failed: 0,
  };

  for (const u of optedIn) {
    const dedup = `${periodKey}:${u.id}`;
    if (sentKeys.has(dedup)) {
      result.skipped++;
      continue;
    }
    try {
      const totalCents = totalsByUser.get(u.id) ?? 0;
      const { subject, text } = composeMonthlyRecap(u.name, monthKey, totalCents);
      await sendEmail({ to: u.email, subject, text });
      sentKeys.add(dedup);
      result.sent++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Templates — kept inline so this lib stays drop-in and i18n-free for now
// ---------------------------------------------------------------------------

export function composeOnboarding(
  kind: AutoEmailKind,
  name: string
): { subject: string; text: string } {
  switch (kind) {
    case "onboarding_d0":
      return {
        subject: "Bienvenue sur AIflex",
        text: `Salut ${name},\n\nMerci d'avoir rejoint AIflex. Tu peux générer ton premier film en 5 minutes : décris ton idée, choisis un format, et l'agent fait le reste.\n\nDémarrer : https://aiflex.app/studio\n\n— L'équipe AIflex`,
      };
    case "onboarding_d1":
      return {
        subject: "Le truc unique d'AIflex : générer la suite des films d'autres créateurs",
        text: `Salut ${name},\n\nUne fois qu'un créateur active "allowSequels" sur son film, n'importe quel abonné peut en générer la suite — et toucher des royalties si c'est ton film qui est suivi.\n\nDécouvre l'idée : https://aiflex.app/legal/community-guidelines\n\n— L'équipe AIflex`,
      };
    case "onboarding_d3":
      return {
        subject: "3 conseils pour des films IA qui captent vraiment",
        text: `Salut ${name},\n\nLes meilleurs films AIflex ont en commun :\n\n1. Un personnage avec UNE faille intime (pas un héros parfait)\n2. Un cadre visuel cohérent (pose un style preset dès le formulaire)\n3. Un cliffhanger ou une promesse de suite\n\nProchaine génération : https://aiflex.app/studio\n\n— L'équipe AIflex`,
      };
    case "onboarding_d7":
      return {
        subject: "Une semaine sur AIflex — lance ton premier projet public",
        text: `Salut ${name},\n\nTu as exploré pendant une semaine. Le moment idéal pour publier ton premier film en mode "public" : il devient eligible aux suites communautaires, aux royalties, aux boosts visibilité, et aux tips spectateurs.\n\nVoir tes options : https://aiflex.app/dashboard\n\n— L'équipe AIflex`,
      };
    default:
      return {
        subject: "AIflex",
        text: "Bonjour, ceci est un message d'AIflex.",
      };
  }
}

export function composeReactivation(name: string): { subject: string; text: string } {
  return {
    subject: "Ces nouveaux films vont peut-être te plaire",
    text: `Salut ${name},\n\nÇa fait deux semaines qu'on ne t'a pas vu. Voici les sorties récentes des créateurs qui ressemblent à ce que tu as aimé : https://aiflex.app/feed\n\nÀ très vite,\nAIflex`,
  };
}

export function composeMonthlyRecap(
  name: string,
  monthKey: string,
  totalCents: number
): { subject: string; text: string } {
  const formatted = (totalCents / 100).toFixed(2);
  return {
    subject: `Récap ${monthKey} — ${formatted}$ générés sur tes films`,
    text: `Salut ${name},\n\nVoici ton récap pour ${monthKey} :\n\n— Revenus créateur : ${formatted}$\n— Détail par film + statut versement : https://aiflex.app/dashboard/payouts\n— Analytics : https://aiflex.app/dashboard\n\nMerci de continuer à créer sur AIflex.`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Recipient {
  id: string;
  email: string;
  name: string;
}

async function filterByNewsletterConsent(
  users: Recipient[]
): Promise<Recipient[]> {
  if (!users.length) return [];
  const consents = await prisma.consentRecord.findMany({
    where: { userId: { in: users.map((u) => u.id) }, type: "newsletter" },
    orderBy: { createdAt: "desc" },
  });
  const latest = new Map<string, boolean>();
  for (const c of consents) {
    if (!latest.has(c.userId)) latest.set(c.userId, c.accepted);
  }
  return users.filter((u) => latest.get(u.id) === true);
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function isoWeek(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = tmp.valueOf();
  tmp.setUTCMonth(0, 1);
  if (tmp.getUTCDay() !== 4) {
    tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - tmp.valueOf()) / (7 * 24 * 60 * 60 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function previousMonthKey(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Test-only escape hatch — clear the in-memory dedup so unit tests can
// exercise the same kind back-to-back without resetting the module.
export function _resetSentKeys(): void {
  sentKeys.clear();
}
