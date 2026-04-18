import "server-only";
import { prisma } from "./prisma";
import { sendEmail } from "./email";

/**
 * Email marketing broadcasts (V8 §27.4).
 *
 * Segments:
 *   - all                  every non-suspended user
 *   - creators             users with at least one published public project
 *   - subscribers_active   users whose plan != "free" and planExpiresAt > now
 *   - inactive_14d         users whose last FilmView is > 14 days old (or none)
 *
 * Newsletter opt-in: derived from the latest `ConsentRecord` of type
 * `newsletter`. Users with `accepted: false` (or never opted in) are excluded
 * — the form on /dashboard/privacy is the source of truth.
 *
 * Sends are throttled at 8/sec by default to stay under Resend's free tier
 * cap. For larger blasts move to a queue.
 */

export type BroadcastSegment =
  | "all"
  | "creators"
  | "subscribers_active"
  | "inactive_14d";

export interface BroadcastInput {
  segment: BroadcastSegment;
  subject: string;
  textBody: string;
  htmlBody?: string;
  /** Optional dry-run: count recipients without actually sending. */
  dryRun?: boolean;
  /** Cap the number of recipients (testing). */
  limit?: number;
}

export interface BroadcastResult {
  segment: BroadcastSegment;
  recipients: number;
  delivered: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
}

const RATE_PER_SEC = 8;

export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const candidates = await resolveSegment(input.segment, input.limit ?? 5_000);
  const optedIn = await filterByNewsletterConsent(candidates);

  const result: BroadcastResult = {
    segment: input.segment,
    recipients: optedIn.length,
    delivered: 0,
    failed: 0,
    skipped: candidates.length - optedIn.length,
    dryRun: !!input.dryRun,
  };

  if (input.dryRun) return result;

  // Throttled fan-out
  for (let i = 0; i < optedIn.length; i++) {
    const recipient = optedIn[i];
    try {
      await sendEmail({
        to: recipient.email,
        // V8 §27.4 — subject also receives token expansion so {{name}}
        // works in headlines like "Bienvenue {{name}}, ton premier film…"
        subject: personalize(input.subject, recipient),
        text: personalize(input.textBody, recipient),
        html: input.htmlBody ? personalize(input.htmlBody, recipient) : undefined,
      });
      result.delivered++;
    } catch {
      result.failed++;
    }
    // Naive rate limit
    if ((i + 1) % RATE_PER_SEC === 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Segment resolution
// ---------------------------------------------------------------------------

interface Recipient {
  id: string;
  email: string;
  name: string;
}

async function resolveSegment(
  segment: BroadcastSegment,
  limit: number
): Promise<Recipient[]> {
  switch (segment) {
    case "all":
      return prisma.user.findMany({
        where: { suspended: false, emailVerified: true },
        select: { id: true, email: true, name: true },
        take: limit,
      });
    case "creators": {
      // Distinct ownerId via raw query — groupBy with take requires
      // orderBy on Prisma 5.x and we just need the unique ids here.
      type Row = { ownerId: string };
      const rows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT DISTINCT "ownerId"
         FROM "Project"
         WHERE published = true
           AND visibility = 'public'
           AND status = 'ready'
         LIMIT $1`,
        limit
      );
      const ids = rows.map((r) => r.ownerId);
      if (!ids.length) return [];
      return prisma.user.findMany({
        where: { id: { in: ids }, suspended: false, emailVerified: true },
        select: { id: true, email: true, name: true },
      });
    }
    case "subscribers_active":
      return prisma.user.findMany({
        where: {
          suspended: false,
          emailVerified: true,
          plan: { not: "free" },
          OR: [
            { planExpiresAt: null },
            { planExpiresAt: { gt: new Date() } },
          ],
        },
        select: { id: true, email: true, name: true },
        take: limit,
      });
    case "inactive_14d": {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const activeUserIds = await prisma.filmView.findMany({
        where: { watchedAt: { gte: cutoff } },
        select: { userId: true },
        distinct: ["userId"],
        take: 50_000,
      });
      const activeSet = new Set(activeUserIds.map((u) => u.userId));
      const all = await prisma.user.findMany({
        where: { suspended: false, emailVerified: true },
        select: { id: true, email: true, name: true },
        take: limit + activeSet.size,
      });
      return all.filter((u) => !activeSet.has(u.id)).slice(0, limit);
    }
  }
}

/**
 * Filter users to only those who explicitly accepted the newsletter
 * consent. Users without any newsletter ConsentRecord are EXCLUDED — we
 * never ship marketing without explicit opt-in.
 */
async function filterByNewsletterConsent(users: Recipient[]): Promise<Recipient[]> {
  if (!users.length) return [];
  const consents = await prisma.consentRecord.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      type: "newsletter",
    },
    orderBy: { createdAt: "desc" },
  });
  const latestByUser = new Map<string, boolean>();
  for (const c of consents) {
    if (!latestByUser.has(c.userId)) {
      latestByUser.set(c.userId, c.accepted);
    }
  }
  return users.filter((u) => latestByUser.get(u.id) === true);
}

// ---------------------------------------------------------------------------
// Tokenized template — {{name}}, {{email}}
// ---------------------------------------------------------------------------

function personalize(template: string, recipient: Recipient): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/g, recipient.name)
    .replace(/\{\{\s*email\s*\}\}/g, recipient.email);
}
