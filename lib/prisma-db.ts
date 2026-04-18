import "server-only";
import { prisma } from "./prisma";
import type {
  Collaborator,
  CollaboratorRole,
  Comment,
  Conversation,
  DirectMessage,
  Notification,
  NotificationKind,
  Profile,
  Project,
  PushSubscription,
  Report,
  Session,
  Tip,
  UserRecord,
  WatchProgress,
} from "./types";
import type { PlatformSettings } from "./platform-settings";
import { DEFAULT_PLATFORM_SETTINGS } from "./platform-settings";
import { hashPassword } from "./password";

// =====================================================================
// Helpers: convert between Prisma rows and the existing TS types.
// The JSON DB uses epoch-millisecond timestamps (number); Prisma uses
// Date objects. We convert back to numbers on read so the rest of the
// codebase stays unchanged.
// =====================================================================

function toEpoch(d: Date): number {
  return d.getTime();
}

function toDate(epoch: number): Date {
  return new Date(epoch);
}

/** Map a Prisma User row to the app's UserRecord shape. */
function rowToUser(row: any): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: row.role as UserRecord["role"],
    suspended: row.suspended,
    createdAt: toEpoch(row.createdAt),
    avatarSeed: row.avatarSeed ?? undefined,
    bio: row.bio ?? undefined,
    emailVerified: row.emailVerified,
    emailVerifiedAt: row.emailVerifiedAt ? toEpoch(row.emailVerifiedAt) : undefined,
    usage: row.usageMonth
      ? { month: row.usageMonth, videosGenerated: row.usageVideos }
      : undefined,
    plan: (row.plan as UserRecord["plan"]) ?? undefined,
    stripeCustomerId: row.stripeCustomerId ?? undefined,
    stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
    planExpiresAt: row.planExpiresAt ? toEpoch(row.planExpiresAt) : undefined,
    oauthProvider: row.oauthProvider ?? undefined,
    oauthId: row.oauthId ?? undefined,
  };
}

function rowToSession(row: any): Session {
  return {
    token: row.token,
    userId: row.userId,
    createdAt: toEpoch(row.createdAt),
    expiresAt: toEpoch(row.expiresAt),
  };
}

function rowToProject(row: any): Project {
  return {
    id: row.id,
    ownerId: row.ownerId,
    createdAt: toEpoch(row.createdAt),
    updatedAt: toEpoch(row.updatedAt),
    stage: row.stage as Project["stage"],
    idea: row.idea,
    genre: row.genre as Project["genre"],
    format: row.format as Project["format"],
    tone: row.tone as Project["tone"],
    endingHint: row.endingHint ?? undefined,
    concept: row.concept ?? undefined,
    scenario: row.scenario ?? undefined,
    scenes: row.scenes ?? undefined,
    seriesId: row.seriesId ?? undefined,
    seriesTitle: row.seriesTitle ?? undefined,
    episodeNumber: row.episodeNumber ?? undefined,
    coverUrl: row.coverUrl ?? undefined,
    published: row.published,
    visibility: (row.visibility as Project["visibility"]) ?? "private",
    publishedAt: row.publishedAt ? toEpoch(row.publishedAt) : undefined,
    views: row.views,
    likes: row.likes,
    author: row.author ?? undefined,
    audioTrackUrl: row.audioTrackUrl ?? undefined,
    audioTrackStatus: row.audioTrackStatus ?? undefined,
  };
}

function rowToComment(row: any): Comment {
  return {
    id: row.id,
    projectId: row.projectId,
    authorId: row.authorId,
    authorName: row.authorName,
    body: row.body,
    createdAt: toEpoch(row.createdAt),
    parentId: row.parentId ?? undefined,
    replyCount: row.replyCount,
  };
}

function rowToNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as NotificationKind,
    message: row.message,
    href: row.href ?? undefined,
    actorId: row.actorId ?? undefined,
    actorName: row.actorName ?? undefined,
    projectId: row.projectId ?? undefined,
    read: row.read,
    createdAt: toEpoch(row.createdAt),
  };
}

function rowToWatchProgress(row: any): WatchProgress {
  return {
    userId: row.userId,
    projectId: row.projectId,
    lastSceneIndex: row.lastSceneIndex,
    progress: row.progress,
    updatedAt: toEpoch(row.updatedAt),
  };
}

function rowToReport(row: any): Report {
  return {
    id: row.id,
    reporterId: row.reporterId,
    reporterEmail: row.reporterEmail,
    targetType: row.targetType as Report["targetType"],
    targetId: row.targetId,
    reason: row.reason,
    detail: row.detail ?? undefined,
    status: row.status as Report["status"],
    createdAt: toEpoch(row.createdAt),
    reviewedAt: row.reviewedAt ? toEpoch(row.reviewedAt) : undefined,
    reviewedBy: row.reviewedBy ?? undefined,
  };
}

function rowToPushSubscription(row: any): PushSubscription {
  return {
    userId: row.userId,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    createdAt: toEpoch(row.createdAt),
  };
}

// =====================================================================
// Admin seed — runs once lazily
// =====================================================================

let seeded = false;

async function ensureAdminSeed(): Promise<void> {
  if (seeded) return;
  seeded = true;

  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  if (adminCount > 0) return;

  const email = (process.env.ADMIN_EMAIL || "admin@aiflex.local")
    .toLowerCase()
    .trim();

  // No shared default password. Generate a random one and log it ONCE if the
  // operator didn't provide a sufficiently strong ADMIN_PASSWORD.
  const envPassword = process.env.ADMIN_PASSWORD;
  let password: string;
  let generated = false;
  if (envPassword && envPassword.length >= 12) {
    password = envPassword;
  } else {
    const { randomBytes } = await import("node:crypto");
    password = randomBytes(18).toString("base64url");
    generated = true;
    if (envPassword && envPassword.length < 12) {
      console.warn(
        `[AIflex] ADMIN_PASSWORD too short (${envPassword.length} chars, min 12). A random password was generated instead.`
      );
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        role: "admin",
        suspended: false,
        emailVerified: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      },
    });
  } else {
    await prisma.user.create({
      data: {
        email,
        name: "AIflex Admin",
        role: "admin",
        suspended: false,
        passwordHash: await hashPassword(password),
        avatarSeed: email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  if (generated) {
    console.warn(
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `[AIflex] Admin account provisioned.\n` +
        `  Email:     ${email}\n` +
        `  Password:  ${password}\n` +
        `  ⚠ Copy it NOW — this is the only time it will be logged.\n` +
        `  ⚠ Sign in at /admin and rotate via /admin/security.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    );
  }
}

// =====================================================================
// Users
// =====================================================================

export async function findUserByEmail(
  email: string
): Promise<UserRecord | undefined> {
  await ensureAdminSeed();
  const row = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  return row ? rowToUser(row) : undefined;
}

export async function findUserById(
  id: string
): Promise<UserRecord | undefined> {
  await ensureAdminSeed();
  const row = await prisma.user.findUnique({ where: { id } });
  return row ? rowToUser(row) : undefined;
}

/** Batch load users by id — one findMany instead of N findUnique calls. */
export async function findUsersByIds(
  ids: string[]
): Promise<Map<string, UserRecord>> {
  await ensureAdminSeed();
  const out = new Map<string, UserRecord>();
  if (ids.length === 0) return out;
  const rows = await prisma.user.findMany({ where: { id: { in: ids } } });
  for (const r of rows) out.set(r.id, rowToUser(r));
  return out;
}

export async function listUsers(): Promise<UserRecord[]> {
  await ensureAdminSeed();
  const rows = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(rowToUser);
}

export async function createUser(
  input: Omit<UserRecord, "id" | "createdAt" | "suspended" | "role"> & {
    role?: UserRecord["role"];
  }
): Promise<UserRecord> {
  await ensureAdminSeed();
  const row = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      role: input.role || "user",
      suspended: false,
      avatarSeed: input.avatarSeed || input.email,
      bio: input.bio,
      emailVerified: input.emailVerified ?? false,
      emailVerifiedAt: input.emailVerifiedAt
        ? toDate(input.emailVerifiedAt)
        : undefined,
      usageMonth: input.usage?.month,
      usageVideos: input.usage?.videosGenerated ?? 0,
      plan: input.plan ?? "free",
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      planExpiresAt: input.planExpiresAt
        ? toDate(input.planExpiresAt)
        : undefined,
      oauthProvider: input.oauthProvider,
      oauthId: input.oauthId,
    },
  });
  return rowToUser(row);
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<UserRecord, "id" | "createdAt">>
): Promise<UserRecord | undefined> {
  const exists = await prisma.user.findUnique({ where: { id } });
  if (!exists) return undefined;

  const data: any = {};
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.passwordHash !== undefined) data.passwordHash = patch.passwordHash;
  if (patch.role !== undefined) data.role = patch.role;
  if (patch.suspended !== undefined) data.suspended = patch.suspended;
  if (patch.avatarSeed !== undefined) data.avatarSeed = patch.avatarSeed;
  if (patch.bio !== undefined) data.bio = patch.bio;
  if (patch.emailVerified !== undefined) data.emailVerified = patch.emailVerified;
  if (patch.emailVerifiedAt !== undefined)
    data.emailVerifiedAt = patch.emailVerifiedAt
      ? toDate(patch.emailVerifiedAt)
      : null;
  if (patch.usage !== undefined) {
    data.usageMonth = patch.usage?.month ?? null;
    data.usageVideos = patch.usage?.videosGenerated ?? 0;
  }
  if (patch.plan !== undefined) data.plan = patch.plan;
  if (patch.stripeCustomerId !== undefined)
    data.stripeCustomerId = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId !== undefined)
    data.stripeSubscriptionId = patch.stripeSubscriptionId;
  if (patch.planExpiresAt !== undefined)
    data.planExpiresAt = patch.planExpiresAt
      ? toDate(patch.planExpiresAt)
      : null;
  if (patch.oauthProvider !== undefined)
    data.oauthProvider = patch.oauthProvider;
  if (patch.oauthId !== undefined) data.oauthId = patch.oauthId;

  const row = await prisma.user.update({ where: { id }, data });
  return rowToUser(row);
}

export async function deleteUser(id: string): Promise<boolean> {
  // Cascade is handled by the DB via onDelete: Cascade on relations.
  try {
    await prisma.user.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

// =====================================================================
// Usage / quotas
// =====================================================================

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getCurrentUsage(
  userId: string
): Promise<{ month: string; videosGenerated: number }> {
  const month = currentMonthKey();
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { usageMonth: true, usageVideos: true },
  });
  if (!row || row.usageMonth !== month) {
    return { month, videosGenerated: 0 };
  }
  return { month, videosGenerated: row.usageVideos };
}

export async function incrementVideoUsage(
  userId: string,
  n = 1
): Promise<number> {
  const month = currentMonthKey();
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { usageMonth: true, usageVideos: true },
  });
  if (!row) throw new Error("Utilisateur introuvable");

  const currentCount = row.usageMonth === month ? row.usageVideos : 0;
  const newCount = currentCount + n;

  await prisma.user.update({
    where: { id: userId },
    data: { usageMonth: month, usageVideos: newCount },
  });
  return newCount;
}

// =====================================================================
// Sessions
// =====================================================================

export async function createSession(userId: string): Promise<Session> {
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);

  const row = await prisma.session.create({
    data: { token, userId, createdAt: now, expiresAt },
  });
  return rowToSession(row);
}

export async function findSession(
  token: string
): Promise<Session | undefined> {
  const row = await prisma.session.findUnique({ where: { token } });
  if (!row) return undefined;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return undefined;
  }
  return rowToSession(row);
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

// =====================================================================
// Projects
// =====================================================================

export async function listProjectsByOwner(
  ownerId: string
): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(rowToProject);
}

export async function listAllProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(rowToProject);
}

export async function listPublicProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    where: { published: true, visibility: "public" },
    orderBy: { publishedAt: "desc" },
  });
  // Secondary sort: fall back to updatedAt when publishedAt is null
  return rows.map(rowToProject).sort((a: Project, b: Project) => {
    const at = a.publishedAt ?? a.updatedAt;
    const bt = b.publishedAt ?? b.updatedAt;
    return bt - at;
  });
}

export async function getProjectById(
  id: string
): Promise<Project | undefined> {
  const row = await prisma.project.findUnique({ where: { id } });
  return row ? rowToProject(row) : undefined;
}

export async function createProject(
  input: Omit<Project, "id" | "createdAt" | "updatedAt">
): Promise<Project> {
  const row = await prisma.project.create({
    data: {
      ownerId: input.ownerId,
      stage: input.stage,
      idea: input.idea,
      genre: input.genre,
      format: input.format,
      tone: input.tone,
      endingHint: input.endingHint,
      concept: input.concept ? JSON.parse(JSON.stringify(input.concept)) : undefined,
      scenario: input.scenario ? JSON.parse(JSON.stringify(input.scenario)) : undefined,
      scenes: input.scenes ? JSON.parse(JSON.stringify(input.scenes)) : undefined,
      seriesId: input.seriesId,
      seriesTitle: input.seriesTitle,
      episodeNumber: input.episodeNumber,
      coverUrl: input.coverUrl,
      published: input.published ?? false,
      visibility: input.visibility ?? "private",
      publishedAt: input.publishedAt ? toDate(input.publishedAt) : undefined,
      views: input.views ?? 0,
      likes: input.likes ?? 0,
      author: input.author,
      audioTrackUrl: input.audioTrackUrl,
      audioTrackStatus: input.audioTrackStatus,
    },
  });
  return rowToProject(row);
}

export async function updateProject(
  id: string,
  patch: Partial<Project>
): Promise<Project | undefined> {
  const exists = await prisma.project.findUnique({ where: { id } });
  if (!exists) return undefined;

  const data: any = {};
  if (patch.stage !== undefined) data.stage = patch.stage;
  if (patch.idea !== undefined) data.idea = patch.idea;
  if (patch.genre !== undefined) data.genre = patch.genre;
  if (patch.format !== undefined) data.format = patch.format;
  if (patch.tone !== undefined) data.tone = patch.tone;
  if (patch.endingHint !== undefined) data.endingHint = patch.endingHint;
  if (patch.concept !== undefined) data.concept = patch.concept;
  if (patch.scenario !== undefined) data.scenario = patch.scenario;
  if (patch.scenes !== undefined) data.scenes = patch.scenes;
  if (patch.seriesId !== undefined) data.seriesId = patch.seriesId;
  if (patch.seriesTitle !== undefined) data.seriesTitle = patch.seriesTitle;
  if (patch.episodeNumber !== undefined) data.episodeNumber = patch.episodeNumber;
  if (patch.coverUrl !== undefined) data.coverUrl = patch.coverUrl;
  if (patch.published !== undefined) data.published = patch.published;
  if (patch.visibility !== undefined) data.visibility = patch.visibility;
  if (patch.publishedAt !== undefined)
    data.publishedAt = patch.publishedAt ? toDate(patch.publishedAt) : null;
  if (patch.views !== undefined) data.views = patch.views;
  if (patch.likes !== undefined) data.likes = patch.likes;
  if (patch.author !== undefined) data.author = patch.author;
  if (patch.audioTrackUrl !== undefined) data.audioTrackUrl = patch.audioTrackUrl;
  if (patch.audioTrackStatus !== undefined)
    data.audioTrackStatus = patch.audioTrackStatus;

  // updatedAt is handled by @updatedAt in schema
  const row = await prisma.project.update({ where: { id }, data });
  return rowToProject(row);
}

export async function deleteProjectById(id: string): Promise<boolean> {
  // Cascade is handled by onDelete: Cascade on relations (likes, watchlist,
  // comments, notifications, watchProgress).
  try {
    await prisma.project.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

// =====================================================================
// Likes
// =====================================================================

export async function hasLiked(
  userId: string,
  projectId: string
): Promise<boolean> {
  const row = await prisma.like.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  return !!row;
}

export async function likeProject(
  userId: string,
  projectId: string
): Promise<{ liked: boolean; count: number }> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Projet introuvable");

  const existing = await prisma.like.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (!existing) {
    await prisma.like.create({ data: { userId, projectId } });
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { likes: { increment: 1 } },
    });
    return { liked: true, count: updated.likes };
  }
  return { liked: true, count: project.likes };
}

export async function unlikeProject(
  userId: string,
  projectId: string
): Promise<{ liked: boolean; count: number }> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Projet introuvable");

  try {
    await prisma.like.delete({
      where: { userId_projectId: { userId, projectId } },
    });
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { likes: { decrement: 1 } },
    });
    return { liked: false, count: Math.max(0, updated.likes) };
  } catch {
    return { liked: false, count: project.likes };
  }
}

// =====================================================================
// Watchlist
// =====================================================================

export async function inWatchlist(
  userId: string,
  projectId: string
): Promise<boolean> {
  const row = await prisma.watchlist.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  return !!row;
}

export async function addToWatchlist(
  userId: string,
  projectId: string
): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Projet introuvable");

  await prisma.watchlist.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId },
    update: {},
  });
}

export async function removeFromWatchlist(
  userId: string,
  projectId: string
): Promise<void> {
  await prisma.watchlist
    .delete({ where: { userId_projectId: { userId, projectId } } })
    .catch(() => {});
}

export async function listWatchlist(userId: string): Promise<Project[]> {
  const entries = await prisma.watchlist.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
    include: { project: true },
  });
  return entries
    .filter((e: { project: { published: boolean; visibility: string } }) => e.project.published && e.project.visibility === "public")
    .map((e: { project: Record<string, unknown> }) => rowToProject(e.project));
}

// =====================================================================
// Comments
// =====================================================================

export async function listCommentsForProject(
  projectId: string
): Promise<Comment[]> {
  const rows = await prisma.comment.findMany({
    where: { projectId, parentId: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(rowToComment);
}

export async function listReplies(commentId: string): Promise<Comment[]> {
  const rows = await prisma.comment.findMany({
    where: { parentId: commentId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(rowToComment);
}

export async function countCommentsForProject(
  projectId: string
): Promise<number> {
  return prisma.comment.count({ where: { projectId } });
}

/** Batch comment count — single groupBy query instead of N individual counts. */
export async function countCommentsForProjects(
  projectIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of projectIds) out.set(id, 0);
  if (projectIds.length === 0) return out;
  const rows = await prisma.comment.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds } },
    _count: { _all: true },
  });
  for (const r of rows) {
    out.set(r.projectId, r._count._all);
  }
  return out;
}

export async function addComment(input: {
  projectId: string;
  authorId: string;
  authorName: string;
  body: string;
  parentId?: string;
}): Promise<Comment> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
  });
  if (!project) throw new Error("Projet introuvable");

  // Resolve effective parent (max 1-level nesting).
  let effectiveParentId = input.parentId;
  if (effectiveParentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: effectiveParentId },
    });
    if (!parent) throw new Error("Commentaire parent introuvable");
    if (parent.parentId) {
      effectiveParentId = parent.parentId;
    }
  }

  const row = await prisma.comment.create({
    data: {
      projectId: input.projectId,
      authorId: input.authorId,
      authorName: input.authorName,
      body: input.body,
      parentId: effectiveParentId,
    },
  });

  // Increment parent's replyCount.
  if (effectiveParentId) {
    await prisma.comment.update({
      where: { id: effectiveParentId },
      data: { replyCount: { increment: 1 } },
    });
  }

  return rowToComment(row);
}

export async function getCommentById(
  id: string
): Promise<Comment | undefined> {
  const row = await prisma.comment.findUnique({ where: { id } });
  return row ? rowToComment(row) : undefined;
}

export async function deleteCommentById(id: string): Promise<boolean> {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) return false;

  // Decrement parent's replyCount if this was a reply.
  if (comment.parentId) {
    await prisma.comment
      .update({
        where: { id: comment.parentId },
        data: { replyCount: { decrement: 1 } },
      })
      .catch(() => {});
  }

  // Cascade: delete replies first, then the comment itself.
  await prisma.comment.deleteMany({ where: { parentId: id } });
  await prisma.comment.delete({ where: { id } });
  return true;
}

// =====================================================================
// Notifications
// =====================================================================

export async function createNotification(input: {
  userId: string;
  kind: NotificationKind;
  message: string;
  href?: string;
  actorId?: string;
  actorName?: string;
  projectId?: string;
}): Promise<Notification | null> {
  // Don't notify yourself.
  if (input.actorId && input.actorId === input.userId) return null;

  // Deduplicate: skip if an unread notif with same key exists.
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      kind: input.kind,
      actorId: input.actorId ?? undefined,
      projectId: input.projectId ?? undefined,
      read: false,
    },
  });
  if (existing) return null;

  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      message: input.message,
      href: input.href,
      actorId: input.actorId,
      actorName: input.actorName,
      projectId: input.projectId,
      read: false,
    },
  });
  return rowToNotification(row);
}

export async function listNotifications(
  userId: string,
  limit = 50
): Promise<Notification[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(rowToNotification);
}

export async function countUnreadNotifications(
  userId: string
): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}

export async function markNotificationRead(
  userId: string,
  notifId: string
): Promise<void> {
  await prisma.notification
    .updateMany({
      where: { id: notifId, userId, read: false },
      data: { read: true },
    });
}

export async function markAllNotificationsRead(
  userId: string
): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

// =====================================================================
// Watch progress
// =====================================================================

export async function getWatchProgress(
  userId: string,
  projectId: string
): Promise<WatchProgress | undefined> {
  const row = await prisma.watchProgress.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  return row ? rowToWatchProgress(row) : undefined;
}

export async function upsertWatchProgress(input: {
  userId: string;
  projectId: string;
  lastSceneIndex: number;
  progress: number;
}): Promise<void> {
  await prisma.watchProgress.upsert({
    where: {
      userId_projectId: {
        userId: input.userId,
        projectId: input.projectId,
      },
    },
    create: {
      userId: input.userId,
      projectId: input.projectId,
      lastSceneIndex: input.lastSceneIndex,
      progress: input.progress,
    },
    update: {
      lastSceneIndex: input.lastSceneIndex,
      progress: input.progress,
    },
  });
}

export async function listContinueWatching(
  userId: string,
  limit = 10
): Promise<Array<WatchProgress & { project: Project }>> {
  const rows = await prisma.watchProgress.findMany({
    where: {
      userId,
      progress: { gt: 0, lt: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { project: true },
  });

  return rows
    .filter((r: { project: { published: boolean; visibility: string } }) => r.project.published && r.project.visibility === "public")
    .map((r: { project: Record<string, unknown>; userId: string; projectId: string; lastSceneIndex: number; progress: number; updatedAt: Date }) => ({
      ...rowToWatchProgress(r),
      project: rowToProject(r.project),
    }));
}

// =====================================================================
// Reports
// =====================================================================

export async function createReport(input: {
  reporterId: string;
  reporterEmail: string;
  targetType: "project" | "comment";
  targetId: string;
  reason: string;
  detail?: string;
}): Promise<Report> {
  const row = await prisma.report.create({
    data: {
      reporterId: input.reporterId,
      reporterEmail: input.reporterEmail,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      detail: input.detail,
      status: "pending",
    },
  });
  return rowToReport(row);
}

export async function listReports(
  status?: Report["status"]
): Promise<Report[]> {
  const rows = await prisma.report.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(rowToReport);
}

export async function updateReportStatus(
  id: string,
  status: Report["status"],
  reviewerId: string
): Promise<Report | undefined> {
  try {
    const row = await prisma.report.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      },
    });
    return rowToReport(row);
  } catch {
    return undefined;
  }
}

// =====================================================================
// Follows
// =====================================================================

export async function followUser(
  followerId: string,
  followedId: string
): Promise<boolean> {
  if (followerId === followedId) return false;
  try {
    await prisma.follow.create({ data: { followerId, followedId } });
    return true;
  } catch {
    // Unique constraint violation = already following
    return false;
  }
}

export async function unfollowUser(
  followerId: string,
  followedId: string
): Promise<boolean> {
  try {
    await prisma.follow.delete({
      where: { followerId_followedId: { followerId, followedId } },
    });
    return true;
  } catch {
    return false;
  }
}

export async function isFollowing(
  followerId: string,
  followedId: string
): Promise<boolean> {
  const row = await prisma.follow.findUnique({
    where: { followerId_followedId: { followerId, followedId } },
  });
  return !!row;
}

export async function getFollowerCount(userId: string): Promise<number> {
  return prisma.follow.count({ where: { followedId: userId } });
}

export async function getFollowingCount(userId: string): Promise<number> {
  return prisma.follow.count({ where: { followerId: userId } });
}

export async function listFollowers(userId: string): Promise<UserRecord[]> {
  const rows = await prisma.follow.findMany({
    where: { followedId: userId },
    include: { follower: true },
  });
  return rows.map((r: { follower: Record<string, unknown> }) => rowToUser(r.follower));
}

export async function listFollowing(userId: string): Promise<UserRecord[]> {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    include: { followed: true },
  });
  return rows.map((r: { followed: Record<string, unknown> }) => rowToUser(r.followed));
}

export async function listVisibleProjects(
  ownerId: string,
  viewerId?: string
): Promise<Project[]> {
  const isFollower = viewerId
    ? await isFollowing(viewerId, ownerId)
    : false;
  const isOwner = viewerId === ownerId;

  const visibilities = ["public"];
  if (isFollower || isOwner) visibilities.push("followers");

  const rows = await prisma.project.findMany({
    where: {
      ownerId,
      published: true,
      visibility: { in: visibilities },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(rowToProject);
}

// =====================================================================
// Stats
// =====================================================================

export async function stats() {
  const [
    totalUsers,
    suspendedUsers,
    admins,
    totalProjects,
    publishedProjects,
    allProjects,
    last7DaysSignups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { suspended: true } }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.project.count(),
    prisma.project.count({
      where: { published: true, visibility: "public" },
    }),
    prisma.project.findMany({ select: { scenes: true } }),
    prisma.user.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    }),
  ]);

  let totalScenes = 0;
  let totalVideos = 0;
  for (const p of allProjects) {
    const scenes = p.scenes as any[] | null;
    if (scenes) {
      totalScenes += scenes.length;
      totalVideos += scenes.filter((s: any) => s.videoUrl).length;
    }
  }

  return {
    totalUsers,
    suspendedUsers,
    admins,
    totalProjects,
    publishedProjects,
    totalScenes,
    totalVideos,
    last7DaysSignups,
  };
}

/** Strip the password hash from a user record. */
export function toPublicUser(u: UserRecord) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// =====================================================================
// Platform settings
// =====================================================================

export async function getSettings(): Promise<PlatformSettings> {
  const row = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
  });
  if (!row) return { ...DEFAULT_PLATFORM_SETTINGS };
  return {
    narrativeModel: row.narrativeModel,
    reasoningLevel: row.reasoningLevel,
    videoModel: row.videoModel,
    allowSignups: row.allowSignups,
    maxScenesPerProject: row.maxScenesPerProject,
    monthlyVideoQuota: row.monthlyVideoQuota,
    apiKeys: row.apiKeys as PlatformSettings["apiKeys"],
    siteContent: row.siteContent as unknown as PlatformSettings["siteContent"],
    ttsModel: row.ttsModel,
    defaultVoice: row.defaultVoice,
  };
}

export async function updateSettings(
  patch: Partial<PlatformSettings>
): Promise<PlatformSettings> {
  const current = await getSettings();
  const merged = { ...current, ...patch };

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      narrativeModel: merged.narrativeModel,
      reasoningLevel: merged.reasoningLevel,
      videoModel: merged.videoModel,
      allowSignups: merged.allowSignups,
      maxScenesPerProject: merged.maxScenesPerProject,
      monthlyVideoQuota: merged.monthlyVideoQuota,
      apiKeys: merged.apiKeys as any,
      siteContent: merged.siteContent as any,
      ttsModel: merged.ttsModel,
      defaultVoice: merged.defaultVoice,
    },
    update: {
      narrativeModel: merged.narrativeModel,
      reasoningLevel: merged.reasoningLevel,
      videoModel: merged.videoModel,
      allowSignups: merged.allowSignups,
      maxScenesPerProject: merged.maxScenesPerProject,
      monthlyVideoQuota: merged.monthlyVideoQuota,
      apiKeys: merged.apiKeys as any,
      siteContent: merged.siteContent as any,
      ttsModel: merged.ttsModel,
      defaultVoice: merged.defaultVoice,
    },
  });
  return merged;
}

// =====================================================================
// Push Subscriptions
// =====================================================================

export async function savePushSubscription(
  sub: PushSubscription
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: {
      userId_endpoint: { userId: sub.userId, endpoint: sub.endpoint },
    },
    create: {
      userId: sub.userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdAt: toDate(sub.createdAt),
    },
    update: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });
}

export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  await prisma.pushSubscription
    .delete({ where: { userId_endpoint: { userId, endpoint } } })
    .catch(() => {});
}

export async function getPushSubscriptionsForUser(
  userId: string
): Promise<PushSubscription[]> {
  const rows = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  return rows.map(rowToPushSubscription);
}

// =====================================================================
// Profiles
// =====================================================================

export async function listProfiles(userId: string): Promise<Profile[]> {
  const rows = await prisma.profile.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return rows.map((r: any) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    avatarSeed: r.avatarSeed ?? undefined,
    isChild: r.isChild,
    maxRating: r.maxRating as Profile["maxRating"],
    createdAt: toEpoch(r.createdAt),
  }));
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const r = await prisma.profile.findUnique({ where: { id } });
  if (!r) return null;
  return { id: r.id, userId: r.userId, name: r.name, avatarSeed: (r as any).avatarSeed ?? undefined, isChild: r.isChild, maxRating: r.maxRating as Profile["maxRating"], createdAt: toEpoch(r.createdAt) };
}

export async function createProfile(input: Omit<Profile, "id" | "createdAt">): Promise<Profile> {
  const r = await prisma.profile.create({
    data: { userId: input.userId, name: input.name, avatarSeed: input.avatarSeed, isChild: input.isChild, maxRating: input.maxRating },
  });
  return { id: r.id, userId: r.userId, name: r.name, avatarSeed: (r as any).avatarSeed ?? undefined, isChild: r.isChild, maxRating: r.maxRating as Profile["maxRating"], createdAt: toEpoch(r.createdAt) };
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<Profile | null> {
  try {
    const r = await prisma.profile.update({ where: { id }, data: { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.isChild !== undefined ? { isChild: patch.isChild } : {}), ...(patch.maxRating !== undefined ? { maxRating: patch.maxRating } : {}), ...(patch.avatarSeed !== undefined ? { avatarSeed: patch.avatarSeed } : {}) } });
    return { id: r.id, userId: r.userId, name: r.name, avatarSeed: (r as any).avatarSeed ?? undefined, isChild: r.isChild, maxRating: r.maxRating as Profile["maxRating"], createdAt: toEpoch(r.createdAt) };
  } catch { return null; }
}

export async function deleteProfile(id: string): Promise<boolean> {
  try { await prisma.profile.delete({ where: { id } }); return true; } catch { return false; }
}

// =====================================================================
// Direct Messages
// =====================================================================

export async function listConversations(userId: string): Promise<Conversation[]> {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: { conversation: { include: { participants: true } } },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });
  return parts.map((p: any) => ({
    id: p.conversation.id,
    participantIds: p.conversation.participants.map((pp: any) => pp.userId),
    lastMessageAt: toEpoch(p.conversation.lastMessageAt),
    createdAt: toEpoch(p.conversation.createdAt),
  }));
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  const c = await prisma.conversation.findUnique({ where: { id }, include: { participants: true } });
  if (!c) return null;
  return { id: c.id, participantIds: (c as any).participants.map((p: any) => p.userId), lastMessageAt: toEpoch(c.lastMessageAt), createdAt: toEpoch(c.createdAt) };
}

export async function findOrCreateConversation(participantIds: string[]): Promise<Conversation> {
  const sorted = [...participantIds].sort();
  // Try to find existing
  const allConvs = await prisma.conversation.findMany({
    include: { participants: true },
  });
  for (const c of allConvs) {
    const cIds = (c as any).participants.map((p: any) => p.userId).sort();
    if (cIds.length === sorted.length && cIds.every((id: string, i: number) => id === sorted[i])) {
      return { id: c.id, participantIds: cIds, lastMessageAt: toEpoch(c.lastMessageAt), createdAt: toEpoch(c.createdAt) };
    }
  }
  // Create new
  const conv = await prisma.conversation.create({
    data: { participants: { create: sorted.map((uid) => ({ userId: uid })) } },
    include: { participants: true },
  });
  return { id: conv.id, participantIds: sorted, lastMessageAt: toEpoch(conv.lastMessageAt), createdAt: toEpoch(conv.createdAt) };
}

export async function listMessages(conversationId: string, limit = 50): Promise<DirectMessage[]> {
  const rows = await prisma.directMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return rows.map((r: any) => ({ id: r.id, conversationId: r.conversationId, senderId: r.senderId, body: r.body, read: r.read, createdAt: toEpoch(r.createdAt) }));
}

export async function sendMessage(input: { conversationId: string; senderId: string; body: string }): Promise<DirectMessage> {
  const r = await prisma.directMessage.create({
    data: { conversationId: input.conversationId, senderId: input.senderId, body: input.body },
  });
  await prisma.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: new Date() } });
  return { id: r.id, conversationId: r.conversationId, senderId: r.senderId, body: r.body, read: r.read, createdAt: toEpoch(r.createdAt) };
}

export async function markMessagesRead(conversationId: string, userId: string): Promise<void> {
  await prisma.directMessage.updateMany({
    where: { conversationId, senderId: { not: userId }, read: false },
    data: { read: true },
  });
}

export async function countUnreadMessages(userId: string): Promise<number> {
  const parts = await prisma.conversationParticipant.findMany({ where: { userId } });
  const convIds = parts.map((p: any) => p.conversationId);
  return prisma.directMessage.count({
    where: { conversationId: { in: convIds }, senderId: { not: userId }, read: false },
  });
}

// =====================================================================
// Collaborators
// =====================================================================

export async function listCollaborators(projectId: string): Promise<Collaborator[]> {
  const rows = await prisma.collaborator.findMany({ where: { projectId } });
  return rows.map((r: any) => ({ id: r.id, projectId: r.projectId, userId: r.userId, role: r.role as CollaboratorRole, invitedBy: r.invitedBy, createdAt: toEpoch(r.createdAt) }));
}

export async function addCollaborator(input: { projectId: string; userId: string; role: CollaboratorRole; invitedBy: string }): Promise<Collaborator> {
  const r = await prisma.collaborator.upsert({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
    create: { projectId: input.projectId, userId: input.userId, role: input.role, invitedBy: input.invitedBy },
    update: { role: input.role },
  });
  return { id: r.id, projectId: r.projectId, userId: r.userId, role: r.role as CollaboratorRole, invitedBy: r.invitedBy, createdAt: toEpoch(r.createdAt) };
}

export async function removeCollaborator(projectId: string, userId: string): Promise<boolean> {
  try { await prisma.collaborator.delete({ where: { projectId_userId: { projectId, userId } } }); return true; } catch { return false; }
}

export async function getCollaboratorRole(projectId: string, userId: string): Promise<CollaboratorRole | null> {
  const r = await prisma.collaborator.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return r ? (r.role as CollaboratorRole) : null;
}

export async function listUserCollaborations(userId: string): Promise<Project[]> {
  const collabs = await prisma.collaborator.findMany({ where: { userId }, include: { project: true } });
  return collabs.map((c: any) => rowToProject(c.project));
}

// =====================================================================
// Tips
// =====================================================================

export async function createTip(input: Omit<Tip, "id" | "createdAt">): Promise<Tip> {
  const r = await prisma.tip.create({
    data: { fromUserId: input.fromUserId, toUserId: input.toUserId, amount: input.amount, currency: input.currency, stripePaymentId: input.stripePaymentId, message: input.message },
  });
  return { id: r.id, fromUserId: r.fromUserId, toUserId: r.toUserId, amount: r.amount, currency: r.currency, stripePaymentId: r.stripePaymentId ?? undefined, message: r.message ?? undefined, createdAt: toEpoch(r.createdAt) };
}

export async function listTipsReceived(userId: string): Promise<Tip[]> {
  const rows = await prisma.tip.findMany({ where: { toUserId: userId }, orderBy: { createdAt: "desc" } });
  return rows.map((r: any) => ({ id: r.id, fromUserId: r.fromUserId, toUserId: r.toUserId, amount: r.amount, currency: r.currency, stripePaymentId: r.stripePaymentId ?? undefined, message: r.message ?? undefined, createdAt: toEpoch(r.createdAt) }));
}

export async function getTipStats(userId: string): Promise<{ totalReceived: number; tipCount: number }> {
  const result = await prisma.tip.aggregate({ where: { toUserId: userId }, _sum: { amount: true }, _count: true });
  return { totalReceived: result._sum.amount ?? 0, tipCount: result._count };
}
