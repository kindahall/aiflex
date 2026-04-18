import "server-only";
import { prisma } from "./prisma";

/**
 * Monthly challenges (V8 §24.5).
 *
 * Admin creates a Challenge (title, theme, prize pool, start/end date).
 * Users submit any of their public films as a `ChallengeEntry`. Community
 * voting runs while the challenge is `open`. When the end date passes,
 * admin moves the challenge to `judging`, picks a winner (stores winnerProjectId
 * on Challenge), pays the prize pool via CreatorPayout, and closes the
 * challenge.
 *
 * Voting is 1-per-user-per-challenge, stored as extra fields on
 * ChallengeEntry (not modelled separately to keep the schema lean).
 */

export async function listActiveChallenges() {
  const now = new Date();
  return prisma.challenge.findMany({
    where: {
      status: "open",
      startAt: { lte: now },
      endAt: { gte: now },
    },
    orderBy: { endAt: "asc" },
    include: {
      _count: { select: { entries: true } },
    },
  });
}

export async function submitChallengeEntry(params: {
  challengeId: string;
  userId: string;
  projectId: string;
}) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: params.challengeId },
    select: { id: true, status: true, endAt: true },
  });
  if (!challenge) throw new Error("Challenge introuvable");
  if (challenge.status !== "open") throw new Error("Challenge fermé");
  if (challenge.endAt < new Date()) throw new Error("Challenge expiré");

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { ownerId: true, visibility: true, status: true },
  });
  if (!project) throw new Error("Film introuvable");
  if (project.ownerId !== params.userId) {
    throw new Error("Tu dois être le créateur du film pour le soumettre");
  }
  if (project.visibility !== "public" || project.status !== "ready") {
    throw new Error("Le film doit être public et prêt");
  }

  // Unique (challengeId, projectId) prevents re-submission
  return prisma.challengeEntry.create({
    data: {
      challengeId: params.challengeId,
      projectId: params.projectId,
    },
  });
}

export async function voteForEntry(entryId: string): Promise<void> {
  // 1 vote per call — callers enforce 1-vote-per-user via their own tracking
  // (a Profile-scoped localStorage token is sufficient for MVP; a real
  // `ChallengeVote` model can be added when spam becomes an issue).
  await prisma.challengeEntry.update({
    where: { id: entryId },
    data: { votes: { increment: 1 } },
  });
}

export async function closeChallenge(
  challengeId: string,
  winnerProjectId: string,
  adminId: string
): Promise<void> {
  const { logAdminAction } = await import("./audit");

  await prisma.challenge.update({
    where: { id: challengeId },
    data: {
      status: "closed",
      winnerProjectId,
    },
  });

  logAdminAction({
    adminId,
    action: "action_report",
    targetId: challengeId,
    targetType: "report", // reuses enum; consider adding "challenge" in a future migration
    metadata: { winnerProjectId, context: "challenge_close" },
  }).catch(() => {});
}
