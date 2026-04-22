import "server-only";
import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type {
  Collaborator,
  CollaboratorRole,
  Comment,
  Conversation,
  DirectMessage,
  FollowEntry,
  LikeEntry,
  Notification,
  NotificationKind,
  Profile,
  Project,
  PushSubscription,
  Report,
  Session,
  Tip,
  UserRecord,
  WatchlistEntry,
  WatchProgress,
} from "./types";
import { hashPassword } from "./password";
import { DEFAULT_PLATFORM_SETTINGS, type PlatformSettings } from "./platform-settings";

/**
 * Simple file-backed JSON database for the AIflex prototype.
 *
 * NOT for production: no concurrency control, no migrations, no indexes.
 * The whole DB is read and rewritten on each mutation. Fine for local dev
 * and self-hosted single-instance deploys; will not work on serverless
 * read-only file systems (Vercel etc.) without adapting to KV/Postgres.
 */

interface DB {
  users: UserRecord[];
  sessions: Session[];
  projects: Project[];
  likes: LikeEntry[];
  watchlist: WatchlistEntry[];
  comments: Comment[];
  notifications: Notification[];
  watchProgress: WatchProgress[];
  reports: Report[];
  follows: FollowEntry[];
  pushSubscriptions: PushSubscription[];
  settings: PlatformSettings;
  profiles: Profile[];
  conversations: Conversation[];
  messages: DirectMessage[];
  collaborators: Collaborator[];
  tips: Tip[];
}

// Tests set AIFLEX_DATA_DIR to a tmp dir so they never touch the
// developer's real .data/db.json. Production uses the default.
const DATA_DIR = process.env.AIFLEX_DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let cache: DB | null = null;
let initPromise: Promise<void> | null = null;
let prodGuardLogged = false;

// 96 bits CSPRNG — IDs are exposed in URLs, must not be guessable.
export function secureIdSuffix(): string {
  return randomBytes(12).toString("base64url");
}

async function ensureInit(): Promise<void> {
  // Production hard guard: the JSON file backend is a dev convenience,
  // not a deployment target. If we're booting in prod without the
  // explicit `AIFLEX_ALLOW_JSON_DB_IN_PROD=1` opt-out, refuse to serve
  // — losing a single .data/db.json on a Vercel pod = full data loss.
  //
  // We exempt the Next.js *build* phase: SSG/ISR pages are evaluated at
  // build time with NODE_ENV=production but no real DB request.
  const isBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export";
  if (
    !isBuild &&
    process.env.NODE_ENV === "production" &&
    process.env.DB_PROVIDER !== "prisma" &&
    process.env.AIFLEX_ALLOW_JSON_DB_IN_PROD !== "1"
  ) {
    if (!prodGuardLogged) {
      // eslint-disable-next-line no-console
      console.error(
        "[server-db] Refusé en production sans DB_PROVIDER=prisma. " +
          "Lancez `npx tsx scripts/migrate-json-to-postgres.ts` puis " +
          "définissez DB_PROVIDER=prisma. Override d'urgence: AIFLEX_ALLOW_JSON_DB_IN_PROD=1."
      );
      prodGuardLogged = true;
    }
    throw new Error("JSON DB désactivée en production — utiliser Prisma (DB_PROVIDER=prisma).");
  }
  if (cache) return;
  if (!initPromise) initPromise = bootstrap();
  await initPromise;
}

async function bootstrap(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<DB>;
    cache = {
      users: parsed.users ?? [],
      sessions: parsed.sessions ?? [],
      projects: parsed.projects ?? [],
      likes: parsed.likes ?? [],
      watchlist: parsed.watchlist ?? [],
      comments: parsed.comments ?? [],
      notifications: parsed.notifications ?? [],
      watchProgress: parsed.watchProgress ?? [],
      reports: parsed.reports ?? [],
      follows: parsed.follows ?? [],
      pushSubscriptions: parsed.pushSubscriptions ?? [],
      settings: { ...DEFAULT_PLATFORM_SETTINGS, ...(parsed.settings ?? {}) },
      profiles: parsed.profiles ?? [],
      conversations: parsed.conversations ?? [],
      messages: parsed.messages ?? [],
      collaborators: parsed.collaborators ?? [],
      tips: parsed.tips ?? [],
    };
  } catch {
    cache = {
      users: [],
      sessions: [],
      projects: [],
      likes: [],
      watchlist: [],
      comments: [],
      notifications: [],
      watchProgress: [],
      reports: [],
      follows: [],
      pushSubscriptions: [],
      settings: { ...DEFAULT_PLATFORM_SETTINGS },
      profiles: [],
      conversations: [],
      messages: [],
      collaborators: [],
      tips: [],
    };
  }

  // Seed an admin user if none exists.
  if (!cache.users.some((u) => u.role === "admin")) {
    const email = (process.env.ADMIN_EMAIL || "admin@aiflex.local").toLowerCase().trim();

    // Security rule: no shared default password. If ADMIN_PASSWORD is missing
    // or too short, generate a random 24-char password and log it ONCE so the
    // operator can copy it. There is no safe "fallback constant" — a default
    // that ships in git is always a compromised default.
    const envPassword = process.env.ADMIN_PASSWORD;
    let password: string;
    let generated = false;
    if (envPassword && envPassword.length >= 12) {
      password = envPassword;
    } else {
      const { randomBytes } = await import("node:crypto");
      password = randomBytes(18).toString("base64url"); // ~24 chars
      generated = true;
      if (envPassword && envPassword.length < 12) {
        // eslint-disable-next-line no-console
        console.warn(
          `[AIflex] ADMIN_PASSWORD trop court (${envPassword.length} chars, minimum 12). Un mot de passe aléatoire a été généré à la place.`
        );
      }
    }

    const now = Date.now();
    const exists = cache.users.find((u) => u.email === email);
    if (exists) {
      exists.role = "admin";
      exists.suspended = false;
      exists.emailVerified = true;
      exists.emailVerifiedAt = exists.emailVerifiedAt ?? now;
    } else {
      cache.users.push({
        id: `u_${now}_${secureIdSuffix()}`,
        email,
        name: "AIflex Admin",
        role: "admin",
        suspended: false,
        createdAt: now,
        passwordHash: await hashPassword(password),
        avatarSeed: email,
        emailVerified: true,
        emailVerifiedAt: now,
      });
    }
    await persist();

    if (generated) {
      // Write the bootstrap password to a root-only file instead of stderr
      // — centralised logging sinks will NOT capture it, and the operator
      // has to explicitly read + then remove the file.
      const credPath = path.join(process.cwd(), ".aiflex-admin-credentials");
      try {
        await fs.writeFile(credPath, `email=${email}\npassword=${password}\n`, { mode: 0o600 });
        // eslint-disable-next-line no-console
        console.warn(
          `[AIflex] Admin bootstrap credentials written to ${credPath} (chmod 0600). ` +
            `Read them once, then \`rm\` the file. They are NOT logged to stderr.`
        );
      } catch (err) {
        // Last-resort fallback: still don't print the password; emit an
        // instruction so the operator can generate one themselves.
        // eslint-disable-next-line no-console
        console.warn(
          `[AIflex] Admin bootstrap: could not write ${credPath} (${
            (err as Error).message
          }). Set ADMIN_PASSWORD in env and restart — the random password was NOT persisted anywhere.`
        );
      }
    }
  }
}

async function persist(): Promise<void> {
  if (!cache) return;
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

// --- Users ------------------------------------------------------------

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  await ensureInit();
  const needle = email.toLowerCase().trim();
  return cache!.users.find((u) => u.email === needle);
}

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  await ensureInit();
  return cache!.users.find((u) => u.id === id);
}

/**
 * Batch load users by id — returns a Map keyed by user id. Missing ids
 * are simply absent from the map. Avoids N+1 findUserById calls on list
 * endpoints like /api/search and /api/users/[id].
 */
export async function findUsersByIds(ids: string[]): Promise<Map<string, UserRecord>> {
  await ensureInit();
  const wanted = new Set(ids);
  const out = new Map<string, UserRecord>();
  for (const u of cache!.users) {
    if (wanted.has(u.id)) out.set(u.id, u);
  }
  return out;
}

export async function findUserByOAuth(
  provider: string,
  oauthId: string
): Promise<UserRecord | undefined> {
  await ensureInit();
  return cache!.users.find((u) => u.oauthProvider === provider && u.oauthId === oauthId);
}

export async function listUsers(): Promise<UserRecord[]> {
  await ensureInit();
  return [...cache!.users].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Resolve several user records by case-insensitive `name` match. Avoids
 * the DOS pattern of `listUsers()` in comment-mention handlers when the
 * table grows beyond a few hundred entries.
 */
export async function findUsersByNames(names: string[]): Promise<Map<string, UserRecord>> {
  await ensureInit();
  const needle = new Set(names.map((n) => n.toLowerCase()));
  const out = new Map<string, UserRecord>();
  for (const u of cache!.users) {
    const key = u.name.toLowerCase();
    if (needle.has(key) && !out.has(key)) out.set(key, u);
  }
  return out;
}

export async function createUser(
  input: Omit<UserRecord, "id" | "createdAt" | "suspended" | "role"> & {
    role?: UserRecord["role"];
  }
): Promise<UserRecord> {
  await ensureInit();
  const now = Date.now();
  const user: UserRecord = {
    id: `u_${now}_${secureIdSuffix()}`,
    createdAt: now,
    suspended: false,
    role: input.role || "user",
    avatarSeed: input.avatarSeed || input.email,
    ...input,
  };
  cache!.users.push(user);
  await persist();
  return user;
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<UserRecord, "id" | "createdAt">>
): Promise<UserRecord | undefined> {
  await ensureInit();
  const u = cache!.users.find((x) => x.id === id);
  if (!u) return undefined;
  Object.assign(u, patch);
  await persist();
  return u;
}

export async function deleteUser(id: string): Promise<boolean> {
  await ensureInit();
  const before = cache!.users.length;
  cache!.users = cache!.users.filter((u) => u.id !== id);
  cache!.sessions = cache!.sessions.filter((s) => s.userId !== id);
  // Cascade: drop projects owned by the user, and any like/watchlist entry
  // either authored by the user or referencing one of their projects.
  const droppedProjectIds = new Set(
    cache!.projects.filter((p) => p.ownerId === id).map((p) => p.id)
  );
  cache!.projects = cache!.projects.filter((p) => p.ownerId !== id);
  cache!.likes = cache!.likes.filter((l) => l.userId !== id && !droppedProjectIds.has(l.projectId));
  cache!.watchlist = cache!.watchlist.filter(
    (w) => w.userId !== id && !droppedProjectIds.has(w.projectId)
  );
  cache!.comments = cache!.comments.filter(
    (c) => c.authorId !== id && !droppedProjectIds.has(c.projectId)
  );
  cache!.notifications = cache!.notifications.filter((n) => n.userId !== id && n.actorId !== id);
  cache!.watchProgress = cache!.watchProgress.filter((w) => w.userId !== id);
  cache!.follows = cache!.follows.filter((f) => f.followerId !== id && f.followedId !== id);
  await persist();
  return cache!.users.length < before;
}

// --- Usage / quotas ---------------------------------------------------

/** Format the current month as "YYYY-MM" — used to key the usage counter. */
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Snapshot of a user's usage for the *current* calendar month, with stale
 * entries normalized to zero. Doesn't write — read-only.
 */
export async function getCurrentUsage(userId: string): Promise<{
  month: string;
  videosGenerated: number;
  imagesGenerated: number;
  atmosMinutesUsed: number;
}> {
  await ensureInit();
  const u = cache!.users.find((x) => x.id === userId);
  const month = currentMonthKey();
  if (!u || !u.usage || u.usage.month !== month) {
    return { month, videosGenerated: 0, imagesGenerated: 0, atmosMinutesUsed: 0 };
  }
  return {
    month,
    videosGenerated: u.usage.videosGenerated,
    imagesGenerated: u.usage.imagesGenerated ?? 0,
    atmosMinutesUsed: u.usage.atmosMinutesUsed ?? 0,
  };
}

/**
 * Increment a user's video generation counter by `n` (default 1). Resets
 * the counter automatically if the stored month is stale. Persists.
 *
 * Returns the new counter value so callers can decide whether to
 * short-circuit further generations.
 */
export async function incrementVideoUsage(userId: string, n = 1): Promise<number> {
  await ensureInit();
  const u = cache!.users.find((x) => x.id === userId);
  if (!u) throw new Error("Utilisateur introuvable");
  const month = currentMonthKey();
  if (!u.usage || u.usage.month !== month) {
    u.usage = { month, videosGenerated: 0, imagesGenerated: 0 };
  }
  u.usage.videosGenerated += n;
  await persist();
  return u.usage.videosGenerated;
}

/**
 * Increment a user's image generation counter by `n`. Resets the bucket
 * if the stored month is stale. Returns the new counter value.
 */
export async function incrementImageUsage(userId: string, n = 1): Promise<number> {
  await ensureInit();
  const u = cache!.users.find((x) => x.id === userId);
  if (!u) throw new Error("Utilisateur introuvable");
  const month = currentMonthKey();
  if (!u.usage || u.usage.month !== month) {
    u.usage = { month, videosGenerated: 0, imagesGenerated: 0 };
  }
  u.usage.imagesGenerated = (u.usage.imagesGenerated ?? 0) + n;
  await persist();
  return u.usage.imagesGenerated;
}

/**
 * Increment a user's Atmos cloud minutes counter. Resets the monthly
 * bucket if `usageMonth` is stale. Minutes are rounded up before caller
 * passes them in (we bill on whole minutes — a 12s clip counts as 1).
 *
 * Returns the new cumulative total for the current month.
 */
export async function incrementAtmosMinutesUsed(userId: string, minutes: number): Promise<number> {
  await ensureInit();
  const u = cache!.users.find((x) => x.id === userId);
  if (!u) throw new Error("Utilisateur introuvable");
  const month = currentMonthKey();
  if (!u.usage || u.usage.month !== month) {
    u.usage = { month, videosGenerated: 0, imagesGenerated: 0 };
  }
  u.usage.atmosMinutesUsed = (u.usage.atmosMinutesUsed ?? 0) + Math.max(0, minutes);
  await persist();
  return u.usage.atmosMinutesUsed;
}

// --- Sessions ---------------------------------------------------------

export async function createSession(
  userId: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<Session> {
  await ensureInit();
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  // 14 days — matches the cookie maxAge after the audit-driven shrink.
  const session: Session = {
    token,
    userId,
    createdAt: now,
    expiresAt: now + 1000 * 60 * 60 * 24 * 14,
    ipAddress: metadata?.ipAddress?.slice(0, 64),
    userAgent: metadata?.userAgent?.slice(0, 400),
    lastSeenAt: now,
  };
  cache!.sessions.push(session);
  await persist();
  return session;
}

/** Bump `lastSeenAt` on a live session — best-effort, never throws. */
export async function touchSession(token: string): Promise<void> {
  await ensureInit();
  const s = cache!.sessions.find((x) => x.token === token);
  if (!s) return;
  s.lastSeenAt = Date.now();
  // Don't persist on every request — that would hammer the JSON file.
  // The in-memory bump is enough for the "active sessions" panel; the
  // next createSession / delete will flush.
}

export async function findSession(token: string): Promise<Session | undefined> {
  await ensureInit();
  const s = cache!.sessions.find((x) => x.token === token);
  if (!s) return undefined;
  if (s.expiresAt < Date.now()) {
    await deleteSession(token);
    return undefined;
  }
  return s;
}

export async function deleteSession(token: string): Promise<void> {
  await ensureInit();
  cache!.sessions = cache!.sessions.filter((s) => s.token !== token);
  await persist();
}

export async function listSessionsByUser(userId: string): Promise<Session[]> {
  await ensureInit();
  const now = Date.now();
  return cache!.sessions
    .filter((s) => s.userId === userId && s.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSessionsForUserExcept(
  userId: string,
  keepToken: string
): Promise<number> {
  await ensureInit();
  const before = cache!.sessions.length;
  cache!.sessions = cache!.sessions.filter((s) => s.userId !== userId || s.token === keepToken);
  const removed = before - cache!.sessions.length;
  if (removed > 0) await persist();
  return removed;
}

/** Revoke every session for a user — used on password reset. */
export async function deleteAllSessionsForUser(userId: string): Promise<number> {
  await ensureInit();
  const before = cache!.sessions.length;
  cache!.sessions = cache!.sessions.filter((s) => s.userId !== userId);
  const removed = before - cache!.sessions.length;
  if (removed > 0) await persist();
  return removed;
}

// --- Projects ---------------------------------------------------------

export async function listProjectsByOwner(ownerId: string): Promise<Project[]> {
  await ensureInit();
  return cache!.projects
    .filter((p) => p.ownerId === ownerId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listAllProjects(): Promise<Project[]> {
  await ensureInit();
  return [...cache!.projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listPublicProjects(): Promise<Project[]> {
  await ensureInit();
  return cache!.projects
    .filter((p) => p.published && p.visibility === "public")
    .sort((a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt));
}

export async function listPublicTemplates(
  opts: {
    category?: string;
    limit?: number;
  } = {}
): Promise<Project[]> {
  await ensureInit();
  const limit = opts.limit ?? 50;
  return cache!.projects
    .filter(
      (p) =>
        p.isTemplate &&
        p.published &&
        p.visibility === "public" &&
        (!opts.category || p.templateCategory === opts.category)
    )
    .sort((a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt))
    .slice(0, limit);
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  await ensureInit();
  return cache!.projects.find((p) => p.id === id);
}

export async function createProject(
  input: Omit<Project, "id" | "createdAt" | "updatedAt">
): Promise<Project> {
  await ensureInit();
  const now = Date.now();
  const p: Project = {
    id: `p_${now}_${secureIdSuffix()}`,
    createdAt: now,
    updatedAt: now,
    views: 0,
    likes: 0,
    visibility: "private",
    ...input,
  };
  cache!.projects.push(p);
  await persist();
  return p;
}

export async function updateProject(
  id: string,
  patch: Partial<Project>
): Promise<Project | undefined> {
  await ensureInit();
  const p = cache!.projects.find((x) => x.id === id);
  if (!p) return undefined;
  Object.assign(p, patch, { updatedAt: Date.now() });
  await persist();
  return p;
}

export async function deleteProjectById(id: string): Promise<boolean> {
  await ensureInit();
  const before = cache!.projects.length;
  cache!.projects = cache!.projects.filter((p) => p.id !== id);
  // Drop dangling engagement entries pointing at the deleted project.
  cache!.likes = cache!.likes.filter((l) => l.projectId !== id);
  cache!.watchlist = cache!.watchlist.filter((w) => w.projectId !== id);
  cache!.comments = cache!.comments.filter((c) => c.projectId !== id);
  cache!.notifications = cache!.notifications.filter((n) => n.projectId !== id);
  cache!.watchProgress = cache!.watchProgress.filter((w) => w.projectId !== id);
  await persist();
  return cache!.projects.length < before;
}

// --- Likes ------------------------------------------------------------

/** Returns true if the user has already liked the project. */
export async function hasLiked(userId: string, projectId: string): Promise<boolean> {
  await ensureInit();
  return cache!.likes.some((l) => l.userId === userId && l.projectId === projectId);
}

/**
 * Idempotent like. The aggregate counter on the project is the source of
 * truth for display; the join row is the source of truth for "did *this*
 * user like it". We keep the two in sync on every mutation.
 */
export async function likeProject(
  userId: string,
  projectId: string
): Promise<{ liked: boolean; count: number }> {
  await ensureInit();
  const project = cache!.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Projet introuvable");
  const exists = cache!.likes.some((l) => l.userId === userId && l.projectId === projectId);
  if (!exists) {
    cache!.likes.push({ userId, projectId, createdAt: Date.now() });
    project.likes = (project.likes || 0) + 1;
    await persist();
  }
  return { liked: true, count: project.likes || 0 };
}

export async function unlikeProject(
  userId: string,
  projectId: string
): Promise<{ liked: boolean; count: number }> {
  await ensureInit();
  const project = cache!.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Projet introuvable");
  const before = cache!.likes.length;
  cache!.likes = cache!.likes.filter((l) => !(l.userId === userId && l.projectId === projectId));
  if (cache!.likes.length < before) {
    project.likes = Math.max(0, (project.likes || 0) - 1);
    await persist();
  }
  return { liked: false, count: project.likes || 0 };
}

// --- Watchlist --------------------------------------------------------

export async function inWatchlist(userId: string, projectId: string): Promise<boolean> {
  await ensureInit();
  return cache!.watchlist.some((w) => w.userId === userId && w.projectId === projectId);
}

export async function addToWatchlist(userId: string, projectId: string): Promise<void> {
  await ensureInit();
  const project = cache!.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Projet introuvable");
  const exists = cache!.watchlist.some((w) => w.userId === userId && w.projectId === projectId);
  if (!exists) {
    cache!.watchlist.push({ userId, projectId, addedAt: Date.now() });
    await persist();
  }
}

export async function removeFromWatchlist(userId: string, projectId: string): Promise<void> {
  await ensureInit();
  const before = cache!.watchlist.length;
  cache!.watchlist = cache!.watchlist.filter(
    (w) => !(w.userId === userId && w.projectId === projectId)
  );
  if (cache!.watchlist.length < before) await persist();
}

/**
 * Returns the user's watchlist filtered down to projects that are still
 * publicly published. Stale entries (project deleted, unpublished, gone
 * private) are silently skipped — we don't surface them and don't
 * proactively delete them either, that's a lazy GC.
 */
export async function listWatchlist(userId: string): Promise<Project[]> {
  await ensureInit();
  const entries = cache!.watchlist
    .filter((w) => w.userId === userId)
    .sort((a, b) => b.addedAt - a.addedAt);
  const out: Project[] = [];
  for (const e of entries) {
    const p = cache!.projects.find((x) => x.id === e.projectId);
    if (p && p.published && p.visibility === "public") out.push(p);
  }
  return out;
}

// --- Comments ---------------------------------------------------------

export async function listCommentsForProject(projectId: string): Promise<Comment[]> {
  await ensureInit();
  return cache!.comments
    .filter((c) => c.projectId === projectId && !c.parentId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Returns replies to a given comment, sorted by createdAt ascending. */
export async function listReplies(commentId: string): Promise<Comment[]> {
  await ensureInit();
  return cache!.comments
    .filter((c) => c.parentId === commentId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function countCommentsForProject(projectId: string): Promise<number> {
  await ensureInit();
  return cache!.comments.filter((c) => c.projectId === projectId).length;
}

/**
 * Batch comment count across multiple projects. One pass over the comments
 * array vs one call-per-project — avoids N+1 on profile pages.
 */
export async function countCommentsForProjects(projectIds: string[]): Promise<Map<string, number>> {
  await ensureInit();
  const out = new Map<string, number>();
  for (const id of projectIds) out.set(id, 0);
  for (const c of cache!.comments) {
    if (out.has(c.projectId)) {
      out.set(c.projectId, (out.get(c.projectId) || 0) + 1);
    }
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
  await ensureInit();
  const project = cache!.projects.find((p) => p.id === input.projectId);
  if (!project) throw new Error("Projet introuvable");

  // If this is a reply, resolve the effective parent (max 1 level nesting).
  let effectiveParentId = input.parentId;
  if (effectiveParentId) {
    const parent = cache!.comments.find((c) => c.id === effectiveParentId);
    if (!parent) throw new Error("Commentaire parent introuvable");
    // If the parent is itself a reply, attach to its parent instead (flat replies).
    if (parent.parentId) {
      effectiveParentId = parent.parentId;
    }
  }

  const now = Date.now();
  const comment: Comment = {
    id: `c_${now}_${secureIdSuffix()}`,
    projectId: input.projectId,
    authorId: input.authorId,
    authorName: input.authorName,
    body: input.body,
    createdAt: now,
    parentId: effectiveParentId,
  };
  cache!.comments.push(comment);

  // Increment parent's replyCount cache.
  if (effectiveParentId) {
    const parent = cache!.comments.find((c) => c.id === effectiveParentId);
    if (parent) {
      parent.replyCount = (parent.replyCount || 0) + 1;
    }
  }

  await persist();
  return comment;
}

export async function getCommentById(id: string): Promise<Comment | undefined> {
  await ensureInit();
  return cache!.comments.find((c) => c.id === id);
}

export async function deleteCommentById(id: string): Promise<boolean> {
  await ensureInit();
  const comment = cache!.comments.find((c) => c.id === id);
  if (!comment) return false;

  // If this comment was a reply, decrement parent's replyCount.
  if (comment.parentId) {
    const parent = cache!.comments.find((c) => c.id === comment.parentId);
    if (parent) {
      parent.replyCount = Math.max(0, (parent.replyCount || 0) - 1);
    }
  }

  // Cascade: also delete all replies to this comment.
  const replyIds = new Set(cache!.comments.filter((c) => c.parentId === id).map((c) => c.id));
  cache!.comments = cache!.comments.filter((c) => c.id !== id && !replyIds.has(c.id));

  await persist();
  return true;
}

// --- Notifications ----------------------------------------------------

/**
 * Creates a notification for a user. Deduplication: if an identical
 * notification (same kind + actorId + projectId) already exists and is
 * unread, we skip to avoid spamming the bell badge.
 */
export async function createNotification(input: {
  userId: string;
  kind: NotificationKind;
  message: string;
  href?: string;
  actorId?: string;
  actorName?: string;
  projectId?: string;
}): Promise<Notification | null> {
  await ensureInit();
  // Don't notify yourself.
  if (input.actorId && input.actorId === input.userId) return null;
  // Deduplicate: skip if an unread notif with same key exists.
  const exists = cache!.notifications.some(
    (n) =>
      n.userId === input.userId &&
      n.kind === input.kind &&
      n.actorId === input.actorId &&
      n.projectId === input.projectId &&
      !n.read
  );
  if (exists) return null;

  const now = Date.now();
  const notif: Notification = {
    id: `n_${now}_${secureIdSuffix()}`,
    userId: input.userId,
    kind: input.kind,
    message: input.message,
    href: input.href,
    actorId: input.actorId,
    actorName: input.actorName,
    projectId: input.projectId,
    read: false,
    createdAt: now,
  };
  cache!.notifications.push(notif);
  await persist();
  return notif;
}

export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  await ensureInit();
  return cache!.notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  await ensureInit();
  return cache!.notifications.filter((n) => n.userId === userId && !n.read).length;
}

export async function markNotificationRead(userId: string, notifId: string): Promise<void> {
  await ensureInit();
  const n = cache!.notifications.find((x) => x.id === notifId && x.userId === userId);
  if (n && !n.read) {
    n.read = true;
    await persist();
  }
}

// --- Watch progress ---------------------------------------------------

export async function getWatchProgress(
  userId: string,
  projectId: string
): Promise<WatchProgress | undefined> {
  await ensureInit();
  return cache!.watchProgress.find((w) => w.userId === userId && w.projectId === projectId);
}

export async function upsertWatchProgress(input: {
  userId: string;
  projectId: string;
  lastSceneIndex: number;
  progress: number;
}): Promise<void> {
  await ensureInit();
  const existing = cache!.watchProgress.find(
    (w) => w.userId === input.userId && w.projectId === input.projectId
  );
  if (existing) {
    existing.lastSceneIndex = input.lastSceneIndex;
    existing.progress = input.progress;
    existing.updatedAt = Date.now();
  } else {
    cache!.watchProgress.push({
      userId: input.userId,
      projectId: input.projectId,
      lastSceneIndex: input.lastSceneIndex,
      progress: input.progress,
      updatedAt: Date.now(),
    });
  }
  await persist();
}

/** Returns the user's recently-watched films, sorted by most recent first. */
export async function listContinueWatching(
  userId: string,
  limit = 10
): Promise<Array<WatchProgress & { project: Project }>> {
  await ensureInit();
  const entries = cache!.watchProgress
    .filter((w) => w.userId === userId && w.progress > 0 && w.progress < 1)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
  const out: Array<WatchProgress & { project: Project }> = [];
  for (const e of entries) {
    const p = cache!.projects.find((x) => x.id === e.projectId);
    if (p && p.published && p.visibility === "public") {
      out.push({ ...e, project: p });
    }
  }
  return out;
}

// --- Reports -------------------------------------------------------------

export async function createReport(input: {
  reporterId: string;
  reporterEmail: string;
  targetType: "project" | "comment";
  targetId: string;
  reason: string;
  detail?: string;
}): Promise<Report> {
  await ensureInit();
  const now = Date.now();
  const report: Report = {
    id: `rep_${now}_${secureIdSuffix()}`,
    ...input,
    status: "pending",
    createdAt: now,
  };
  cache!.reports.push(report);
  await persist();
  return report;
}

export async function listReports(status?: Report["status"]): Promise<Report[]> {
  await ensureInit();
  return cache!.reports
    .filter((r) => !status || r.status === status)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Count reports a given reporter has filed since `sinceMs`. */
export async function countReportsByReporter(reporterId: string, sinceMs: number): Promise<number> {
  await ensureInit();
  return cache!.reports.filter((r) => r.reporterId === reporterId && r.createdAt >= sinceMs).length;
}

/** Return all reports filed by a reporter — used by the abuse-detection path. */
export async function listReportsByReporter(reporterId: string): Promise<Report[]> {
  await ensureInit();
  return cache!.reports
    .filter((r) => r.reporterId === reporterId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateReportStatus(
  id: string,
  status: Report["status"],
  reviewerId: string
): Promise<Report | undefined> {
  await ensureInit();
  const r = cache!.reports.find((x) => x.id === id);
  if (!r) return undefined;
  r.status = status;
  r.reviewedAt = Date.now();
  r.reviewedBy = reviewerId;
  await persist();
  return r;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await ensureInit();
  let changed = false;
  for (const n of cache!.notifications) {
    if (n.userId === userId && !n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) await persist();
}

// --- Follows --------------------------------------------------------------

export async function followUser(followerId: string, followedId: string): Promise<boolean> {
  await ensureInit();
  if (followerId === followedId) return false;
  const exists = cache!.follows.some(
    (f) => f.followerId === followerId && f.followedId === followedId
  );
  if (exists) return false;
  cache!.follows.push({ followerId, followedId, createdAt: Date.now() });
  await persist();
  return true;
}

export async function unfollowUser(followerId: string, followedId: string): Promise<boolean> {
  await ensureInit();
  const before = cache!.follows.length;
  cache!.follows = cache!.follows.filter(
    (f) => !(f.followerId === followerId && f.followedId === followedId)
  );
  if (cache!.follows.length < before) {
    await persist();
    return true;
  }
  return false;
}

export async function isFollowing(followerId: string, followedId: string): Promise<boolean> {
  await ensureInit();
  return cache!.follows.some((f) => f.followerId === followerId && f.followedId === followedId);
}

export async function getFollowerCount(userId: string): Promise<number> {
  await ensureInit();
  return cache!.follows.filter((f) => f.followedId === userId).length;
}

export async function getFollowingCount(userId: string): Promise<number> {
  await ensureInit();
  return cache!.follows.filter((f) => f.followerId === userId).length;
}

export async function listFollowers(userId: string): Promise<UserRecord[]> {
  await ensureInit();
  const ids = cache!.follows.filter((f) => f.followedId === userId).map((f) => f.followerId);
  return cache!.users.filter((u) => ids.includes(u.id));
}

export async function listFollowing(userId: string): Promise<UserRecord[]> {
  await ensureInit();
  const ids = cache!.follows.filter((f) => f.followerId === userId).map((f) => f.followedId);
  return cache!.users.filter((u) => ids.includes(u.id));
}

/** List projects visible to a follower (public + followers-only). */
export async function listVisibleProjects(ownerId: string, viewerId?: string): Promise<Project[]> {
  await ensureInit();
  const isFollower = viewerId ? await isFollowing(viewerId, ownerId) : false;
  const isOwner = viewerId === ownerId;

  return cache!.projects
    .filter((p) => {
      if (p.ownerId !== ownerId) return false;
      if (!p.published) return false;
      if (p.visibility === "public") return true;
      if (p.visibility === "followers" && (isFollower || isOwner)) return true;
      return false;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// --- Stats ------------------------------------------------------------

export async function stats() {
  await ensureInit();
  const users = cache!.users;
  const projects = cache!.projects;
  return {
    totalUsers: users.length,
    suspendedUsers: users.filter((u) => u.suspended).length,
    admins: users.filter((u) => u.role === "admin").length,
    totalProjects: projects.length,
    publishedProjects: projects.filter((p) => p.published && p.visibility === "public").length,
    totalScenes: projects.reduce((n, p) => n + (p.scenes?.length || 0), 0),
    totalVideos: projects.reduce(
      (n, p) => n + (p.scenes?.filter((s) => s.videoUrl).length || 0),
      0
    ),
    last7DaysSignups: users.filter((u) => u.createdAt > Date.now() - 7 * 24 * 3600 * 1000).length,
  };
}

/** Strip the password hash from a user record before shipping to the client. */
export function toPublicUser(u: UserRecord) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, stripeCustomerId, stripeSubscriptionId, ...rest } = u;
  return rest;
}

// --- Platform settings ------------------------------------------------

export async function getSettings(): Promise<PlatformSettings> {
  await ensureInit();
  return { ...cache!.settings };
}

export async function updateSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  await ensureInit();
  cache!.settings = { ...cache!.settings, ...patch };
  await persist();
  return { ...cache!.settings };
}

// --- Push Subscriptions ------------------------------------------------

export async function savePushSubscription(sub: PushSubscription): Promise<void> {
  await ensureInit();
  // A given push endpoint is unique to ONE browser/device — never allow
  // two users to share it. Dropping the row across users prevents a
  // logged-in attacker from re-registering the victim's endpoint under
  // their account and hijacking their push notifications.
  cache!.pushSubscriptions = cache!.pushSubscriptions.filter((s) => s.endpoint !== sub.endpoint);
  cache!.pushSubscriptions.push(sub);
  await persist();
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await ensureInit();
  cache!.pushSubscriptions = cache!.pushSubscriptions.filter(
    (s) => !(s.userId === userId && s.endpoint === endpoint)
  );
  await persist();
}

export async function getPushSubscriptionsForUser(userId: string): Promise<PushSubscription[]> {
  await ensureInit();
  return cache!.pushSubscriptions.filter((s) => s.userId === userId);
}

// --- Profiles (Multi-profile) -------------------------------------------

export async function listProfiles(userId: string): Promise<Profile[]> {
  await ensureInit();
  return cache!.profiles.filter((p) => p.userId === userId);
}

export async function getProfileById(id: string): Promise<Profile | null> {
  await ensureInit();
  return cache!.profiles.find((p) => p.id === id) ?? null;
}

export async function createProfile(input: Omit<Profile, "id" | "createdAt">): Promise<Profile> {
  await ensureInit();
  const profile: Profile = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  cache!.profiles.push(profile);
  await persist();
  return profile;
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<Profile | null> {
  await ensureInit();
  const idx = cache!.profiles.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  cache!.profiles[idx] = { ...cache!.profiles[idx], ...patch };
  await persist();
  return cache!.profiles[idx];
}

export async function deleteProfile(id: string): Promise<boolean> {
  await ensureInit();
  const before = cache!.profiles.length;
  cache!.profiles = cache!.profiles.filter((p) => p.id !== id);
  if (cache!.profiles.length < before) {
    await persist();
    return true;
  }
  return false;
}

// --- Direct Messages ---------------------------------------------------

export async function listConversations(userId: string): Promise<Conversation[]> {
  await ensureInit();
  return cache!.conversations
    .filter((c) => c.participantIds.includes(userId))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  await ensureInit();
  return cache!.conversations.find((c) => c.id === id) ?? null;
}

export async function findOrCreateConversation(participantIds: string[]): Promise<Conversation> {
  await ensureInit();
  const sorted = [...participantIds].sort();
  const existing = cache!.conversations.find((c) => {
    const cSorted = [...c.participantIds].sort();
    return cSorted.length === sorted.length && cSorted.every((id, i) => id === sorted[i]);
  });
  if (existing) return existing;

  const conv: Conversation = {
    id: crypto.randomUUID(),
    participantIds: sorted,
    lastMessageAt: Date.now(),
    createdAt: Date.now(),
  };
  cache!.conversations.push(conv);
  await persist();
  return conv;
}

export async function listMessages(conversationId: string, limit = 50): Promise<DirectMessage[]> {
  await ensureInit();
  return cache!.messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit);
}

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
}): Promise<DirectMessage> {
  await ensureInit();
  const msg: DirectMessage = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    senderId: input.senderId,
    body: input.body,
    read: false,
    createdAt: Date.now(),
  };
  cache!.messages.push(msg);
  // Update conversation lastMessageAt
  const conv = cache!.conversations.find((c) => c.id === input.conversationId);
  if (conv) conv.lastMessageAt = msg.createdAt;
  await persist();
  return msg;
}

export async function markMessagesRead(conversationId: string, userId: string): Promise<void> {
  await ensureInit();
  let changed = false;
  for (const msg of cache!.messages) {
    if (msg.conversationId === conversationId && msg.senderId !== userId && !msg.read) {
      msg.read = true;
      changed = true;
    }
  }
  if (changed) await persist();
}

export async function countUnreadMessages(userId: string): Promise<number> {
  await ensureInit();
  const userConvIds = cache!.conversations
    .filter((c) => c.participantIds.includes(userId))
    .map((c) => c.id);
  return cache!.messages.filter(
    (m) => userConvIds.includes(m.conversationId) && m.senderId !== userId && !m.read
  ).length;
}

// --- Collaborators -------------------------------------------------------

export async function listCollaborators(projectId: string): Promise<Collaborator[]> {
  await ensureInit();
  return cache!.collaborators.filter((c) => c.projectId === projectId);
}

export async function addCollaborator(input: {
  projectId: string;
  userId: string;
  role: CollaboratorRole;
  invitedBy: string;
}): Promise<Collaborator> {
  await ensureInit();
  // Remove existing if any
  cache!.collaborators = cache!.collaborators.filter(
    (c) => !(c.projectId === input.projectId && c.userId === input.userId)
  );
  const collab: Collaborator = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: Date.now(),
  };
  cache!.collaborators.push(collab);
  await persist();
  return collab;
}

export async function removeCollaborator(projectId: string, userId: string): Promise<boolean> {
  await ensureInit();
  const before = cache!.collaborators.length;
  cache!.collaborators = cache!.collaborators.filter(
    (c) => !(c.projectId === projectId && c.userId === userId)
  );
  if (cache!.collaborators.length < before) {
    await persist();
    return true;
  }
  return false;
}

export async function getCollaboratorRole(
  projectId: string,
  userId: string
): Promise<CollaboratorRole | null> {
  await ensureInit();
  const c = cache!.collaborators.find((c) => c.projectId === projectId && c.userId === userId);
  return c?.role ?? null;
}

export async function listUserCollaborations(userId: string): Promise<Project[]> {
  await ensureInit();
  const projectIds = cache!.collaborators
    .filter((c) => c.userId === userId)
    .map((c) => c.projectId);
  return cache!.projects.filter((p) => projectIds.includes(p.id));
}

// --- Tips ----------------------------------------------------------------

export async function createTip(input: Omit<Tip, "id" | "createdAt">): Promise<Tip> {
  await ensureInit();
  const tip: Tip = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  cache!.tips.push(tip);
  await persist();
  return tip;
}

export async function listTipsReceived(userId: string): Promise<Tip[]> {
  await ensureInit();
  return cache!.tips.filter((t) => t.toUserId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getTipStats(userId: string): Promise<{
  totalReceived: number;
  tipCount: number;
}> {
  await ensureInit();
  const tips = cache!.tips.filter((t) => t.toUserId === userId);
  return {
    totalReceived: tips.reduce((sum, t) => sum + t.amount, 0),
    tipCount: tips.length,
  };
}
