/**
 * migrate-json-to-postgres.ts
 *
 * One-shot migration script: reads .data/db.json and inserts every record
 * into a PostgreSQL database via Prisma. Existing IDs are preserved.
 *
 * Usage:
 *   npx tsx scripts/migrate-json-to-postgres.ts
 *
 * Prerequisites:
 *   - DATABASE_URL is set in .env / .env.local
 *   - `npx prisma db push` (or `npx prisma migrate deploy`) has been run
 *     so the PostgreSQL schema exists
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

interface JsonDB {
  users?: any[];
  sessions?: any[];
  projects?: any[];
  likes?: any[];
  watchlist?: any[];
  comments?: any[];
  notifications?: any[];
  watchProgress?: any[];
  reports?: any[];
  follows?: any[];
  pushSubscriptions?: any[];
  settings?: any;
}

function toDate(epoch: number): Date {
  return new Date(epoch);
}

async function main() {
  const dbPath = path.join(process.cwd(), ".data", "db.json");
  let raw: string;
  try {
    raw = await fs.readFile(dbPath, "utf8");
  } catch {
    console.error(`Could not read ${dbPath}. Make sure .data/db.json exists.`);
    process.exit(1);
  }

  const data: JsonDB = JSON.parse(raw);
  console.log("Read db.json successfully.");
  console.log(
    `  users: ${data.users?.length ?? 0}, projects: ${data.projects?.length ?? 0}, sessions: ${data.sessions?.length ?? 0}`
  );

  // ---------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------
  if (data.users?.length) {
    console.log(`Migrating ${data.users.length} users...`);
    for (const u of data.users) {
      await prisma.user.upsert({
        where: { id: u.id },
        create: {
          id: u.id,
          email: u.email,
          name: u.name,
          passwordHash: u.passwordHash,
          role: u.role ?? "user",
          suspended: u.suspended ?? false,
          createdAt: toDate(u.createdAt),
          avatarSeed: u.avatarSeed ?? null,
          bio: u.bio ?? null,
          emailVerified: u.emailVerified ?? false,
          emailVerifiedAt: u.emailVerifiedAt
            ? toDate(u.emailVerifiedAt)
            : null,
          usageMonth: u.usage?.month ?? null,
          usageVideos: u.usage?.videosGenerated ?? 0,
          plan: u.plan ?? "free",
          stripeCustomerId: u.stripeCustomerId ?? null,
          stripeSubscriptionId: u.stripeSubscriptionId ?? null,
          planExpiresAt: u.planExpiresAt ? toDate(u.planExpiresAt) : null,
          oauthProvider: u.oauthProvider ?? null,
          oauthId: u.oauthId ?? null,
        },
        update: {},
      });
    }
  }

  // ---------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------
  if (data.sessions?.length) {
    console.log(`Migrating ${data.sessions.length} sessions...`);
    for (const s of data.sessions) {
      await prisma.session.upsert({
        where: { token: s.token },
        create: {
          token: s.token,
          userId: s.userId,
          createdAt: toDate(s.createdAt),
          expiresAt: toDate(s.expiresAt),
        },
        update: {},
      });
    }
  }

  // ---------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------
  if (data.projects?.length) {
    console.log(`Migrating ${data.projects.length} projects...`);
    for (const p of data.projects) {
      await prisma.project.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          ownerId: p.ownerId,
          createdAt: toDate(p.createdAt),
          updatedAt: toDate(p.updatedAt),
          stage: p.stage,
          idea: p.idea,
          genre: p.genre,
          format: p.format,
          tone: p.tone,
          endingHint: p.endingHint ?? null,
          concept: p.concept ?? undefined,
          scenario: p.scenario ?? undefined,
          scenes: p.scenes ?? undefined,
          seriesId: p.seriesId ?? null,
          seriesTitle: p.seriesTitle ?? null,
          episodeNumber: p.episodeNumber ?? null,
          coverUrl: p.coverUrl ?? null,
          published: p.published ?? false,
          visibility: p.visibility ?? "private",
          publishedAt: p.publishedAt ? toDate(p.publishedAt) : null,
          views: p.views ?? 0,
          likes: p.likes ?? 0,
          author: p.author ?? null,
          audioTrackUrl: p.audioTrackUrl ?? null,
          audioTrackStatus: p.audioTrackStatus ?? null,
        },
        update: {},
      });
    }
  }

  // ---------------------------------------------------------------
  // Likes
  // ---------------------------------------------------------------
  if (data.likes?.length) {
    console.log(`Migrating ${data.likes.length} likes...`);
    for (const l of data.likes) {
      await prisma.like
        .create({
          data: {
            userId: l.userId,
            projectId: l.projectId,
            createdAt: toDate(l.createdAt),
          },
        })
        .catch(() => {
          // Skip duplicates
        });
    }
  }

  // ---------------------------------------------------------------
  // Watchlist
  // ---------------------------------------------------------------
  if (data.watchlist?.length) {
    console.log(`Migrating ${data.watchlist.length} watchlist entries...`);
    for (const w of data.watchlist) {
      await prisma.watchlist
        .create({
          data: {
            userId: w.userId,
            projectId: w.projectId,
            addedAt: toDate(w.addedAt),
          },
        })
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------
  if (data.comments?.length) {
    console.log(`Migrating ${data.comments.length} comments...`);
    // Insert parent comments first (parentId is null), then replies.
    const parents = data.comments.filter((c: any) => !c.parentId);
    const replies = data.comments.filter((c: any) => c.parentId);

    for (const c of parents) {
      await prisma.comment.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          projectId: c.projectId,
          authorId: c.authorId,
          authorName: c.authorName,
          body: c.body,
          parentId: null,
          replyCount: c.replyCount ?? 0,
          createdAt: toDate(c.createdAt),
        },
        update: {},
      });
    }
    for (const c of replies) {
      await prisma.comment.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          projectId: c.projectId,
          authorId: c.authorId,
          authorName: c.authorName,
          body: c.body,
          parentId: c.parentId,
          replyCount: c.replyCount ?? 0,
          createdAt: toDate(c.createdAt),
        },
        update: {},
      });
    }
  }

  // ---------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------
  if (data.notifications?.length) {
    console.log(`Migrating ${data.notifications.length} notifications...`);
    for (const n of data.notifications) {
      await prisma.notification.upsert({
        where: { id: n.id },
        create: {
          id: n.id,
          userId: n.userId,
          kind: n.kind,
          message: n.message,
          href: n.href ?? null,
          actorId: n.actorId ?? null,
          actorName: n.actorName ?? null,
          projectId: n.projectId ?? null,
          read: n.read ?? false,
          createdAt: toDate(n.createdAt),
        },
        update: {},
      });
    }
  }

  // ---------------------------------------------------------------
  // WatchProgress
  // ---------------------------------------------------------------
  if (data.watchProgress?.length) {
    console.log(`Migrating ${data.watchProgress.length} watch progress entries...`);
    for (const w of data.watchProgress) {
      await prisma.watchProgress
        .create({
          data: {
            userId: w.userId,
            projectId: w.projectId,
            lastSceneIndex: w.lastSceneIndex,
            progress: w.progress,
            updatedAt: toDate(w.updatedAt),
          },
        })
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------
  if (data.reports?.length) {
    console.log(`Migrating ${data.reports.length} reports...`);
    for (const r of data.reports) {
      await prisma.report.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          reporterId: r.reporterId,
          reporterEmail: r.reporterEmail,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          detail: r.detail ?? null,
          status: r.status ?? "pending",
          createdAt: toDate(r.createdAt),
          reviewedAt: r.reviewedAt ? toDate(r.reviewedAt) : null,
          reviewedBy: r.reviewedBy ?? null,
        },
        update: {},
      });
    }
  }

  // ---------------------------------------------------------------
  // Follows
  // ---------------------------------------------------------------
  if (data.follows?.length) {
    console.log(`Migrating ${data.follows.length} follows...`);
    for (const f of data.follows) {
      await prisma.follow
        .create({
          data: {
            followerId: f.followerId,
            followedId: f.followedId,
            createdAt: toDate(f.createdAt),
          },
        })
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------
  // Push Subscriptions
  // ---------------------------------------------------------------
  if (data.pushSubscriptions?.length) {
    console.log(
      `Migrating ${data.pushSubscriptions.length} push subscriptions...`
    );
    for (const s of data.pushSubscriptions) {
      await prisma.pushSubscription
        .create({
          data: {
            userId: s.userId,
            endpoint: s.endpoint,
            p256dh: s.keys?.p256dh ?? s.p256dh ?? "",
            auth: s.keys?.auth ?? s.auth ?? "",
            createdAt: toDate(s.createdAt),
          },
        })
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------
  // Platform Settings
  // ---------------------------------------------------------------
  if (data.settings) {
    console.log("Migrating platform settings...");
    const s = data.settings;
    await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        narrativeModel: s.narrativeModel ?? "gpt-5.4",
        reasoningLevel: s.reasoningLevel ?? "medium",
        videoModel:
          s.videoModel ??
          "fal-ai/bytedance/seedance/v2/pro/text-to-video",
        allowSignups: s.allowSignups ?? true,
        maxScenesPerProject: s.maxScenesPerProject ?? 24,
        monthlyVideoQuota: s.monthlyVideoQuota ?? 30,
        apiKeys: s.apiKeys ?? {},
        siteContent: s.siteContent ?? {},
        ttsModel: s.ttsModel ?? "openai-tts-1-hd",
        defaultVoice: s.defaultVoice ?? "nova",
      },
      update: {
        narrativeModel: s.narrativeModel,
        reasoningLevel: s.reasoningLevel,
        videoModel: s.videoModel,
        allowSignups: s.allowSignups,
        maxScenesPerProject: s.maxScenesPerProject,
        monthlyVideoQuota: s.monthlyVideoQuota,
        apiKeys: s.apiKeys ?? {},
        siteContent: s.siteContent ?? {},
        ttsModel: s.ttsModel,
        defaultVoice: s.defaultVoice,
      },
    });
  }

  console.log("\nMigration complete!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
