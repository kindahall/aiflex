import "server-only";

/**
 * Database adapter — routes all DB calls to either the JSON file backend
 * (default) or the Prisma/PostgreSQL backend based on the DB_PROVIDER env var.
 *
 * Usage:
 *   import * as db from "@/lib/db-adapter";
 *   const user = await db.findUserByEmail("alice@example.com");
 *
 * Set DB_PROVIDER="prisma" in .env.local to use PostgreSQL.
 * Default (unset or "json") keeps the existing JSON file database.
 */

import type * as ServerDB from "./server-db";

const provider = process.env.DB_PROVIDER || "json";

type Impl = typeof ServerDB;

let _impl: Impl | null = null;

async function impl(): Promise<Impl> {
  if (!_impl) {
    if (provider === "prisma") {
      _impl = (await import("./prisma-db")) as unknown as Impl;
    } else {
      _impl = await import("./server-db");
    }
  }
  return _impl;
}

// Helper to create a proxy function that forwards to the implementation
function proxy<K extends keyof Impl>(name: K): Impl[K] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (async (...args: any[]) => {
    const mod = await impl();
    const fn = mod[name];
    if (typeof fn === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (fn as any)(...args);
    }
    return fn;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

// --- Users ---
export const findUserByEmail = proxy("findUserByEmail");
export const findUserById = proxy("findUserById");
export const findUsersByIds = proxy("findUsersByIds");
export const findUserByOAuth = proxy("findUserByOAuth");
export const listUsers = proxy("listUsers");
export const createUser = proxy("createUser");
export const updateUser = proxy("updateUser");
export const deleteUser = proxy("deleteUser");

// --- Usage / quotas ---
export const getCurrentUsage = proxy("getCurrentUsage");
export const incrementVideoUsage = proxy("incrementVideoUsage");
export const incrementImageUsage = proxy("incrementImageUsage");
export const incrementAtmosMinutesUsed = proxy("incrementAtmosMinutesUsed");

// --- Sessions ---
export const createSession = proxy("createSession");
export const findSession = proxy("findSession");
export const deleteSession = proxy("deleteSession");

// --- Projects ---
export const listProjectsByOwner = proxy("listProjectsByOwner");
export const listAllProjects = proxy("listAllProjects");
export const listPublicProjects = proxy("listPublicProjects");
export const getProjectById = proxy("getProjectById");
export const createProject = proxy("createProject");
export const updateProject = proxy("updateProject");
export const deleteProjectById = proxy("deleteProjectById");

// --- Likes ---
export const hasLiked = proxy("hasLiked");
export const likeProject = proxy("likeProject");
export const unlikeProject = proxy("unlikeProject");

// --- Watchlist ---
export const inWatchlist = proxy("inWatchlist");
export const addToWatchlist = proxy("addToWatchlist");
export const removeFromWatchlist = proxy("removeFromWatchlist");
export const listWatchlist = proxy("listWatchlist");

// --- Comments ---
export const listCommentsForProject = proxy("listCommentsForProject");
export const listReplies = proxy("listReplies");
export const countCommentsForProject = proxy("countCommentsForProject");
export const countCommentsForProjects = proxy("countCommentsForProjects");
export const addComment = proxy("addComment");
export const getCommentById = proxy("getCommentById");
export const deleteCommentById = proxy("deleteCommentById");

// --- Notifications ---
export const createNotification = proxy("createNotification");
export const listNotifications = proxy("listNotifications");
export const countUnreadNotifications = proxy("countUnreadNotifications");
export const markNotificationRead = proxy("markNotificationRead");
export const markAllNotificationsRead = proxy("markAllNotificationsRead");

// --- Watch progress ---
export const getWatchProgress = proxy("getWatchProgress");
export const upsertWatchProgress = proxy("upsertWatchProgress");
export const listContinueWatching = proxy("listContinueWatching");

// --- Reports ---
export const createReport = proxy("createReport");
export const listReports = proxy("listReports");
export const updateReportStatus = proxy("updateReportStatus");

// --- Follows ---
export const followUser = proxy("followUser");
export const unfollowUser = proxy("unfollowUser");
export const isFollowing = proxy("isFollowing");
export const getFollowerCount = proxy("getFollowerCount");
export const getFollowingCount = proxy("getFollowingCount");
export const listFollowers = proxy("listFollowers");
export const listFollowing = proxy("listFollowing");
export const listVisibleProjects = proxy("listVisibleProjects");

// --- Stats ---
export const stats = proxy("stats");

/** Strip the password hash from a user record before shipping to the client. */
export function toPublicUser(u: {
  passwordHash: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  [key: string]: unknown;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, stripeCustomerId, stripeSubscriptionId, ...rest } = u;
  return rest;
}

// --- Platform settings ---
export const getSettings = proxy("getSettings");
export const updateSettings = proxy("updateSettings");

// --- Push Subscriptions ---
export const savePushSubscription = proxy("savePushSubscription");
export const removePushSubscription = proxy("removePushSubscription");
export const getPushSubscriptionsForUser = proxy("getPushSubscriptionsForUser");

// --- Profiles ---
export const listProfiles = proxy("listProfiles");
export const getProfileById = proxy("getProfileById");
export const createProfile = proxy("createProfile");
export const updateProfile = proxy("updateProfile");
export const deleteProfile = proxy("deleteProfile");

// --- Direct Messages ---
export const listConversations = proxy("listConversations");
export const getConversationById = proxy("getConversationById");
export const findOrCreateConversation = proxy("findOrCreateConversation");
export const listMessages = proxy("listMessages");
export const sendMessage = proxy("sendMessage");
export const markMessagesRead = proxy("markMessagesRead");
export const countUnreadMessages = proxy("countUnreadMessages");

// --- Collaborators ---
export const listCollaborators = proxy("listCollaborators");
export const addCollaborator = proxy("addCollaborator");
export const removeCollaborator = proxy("removeCollaborator");
export const getCollaboratorRole = proxy("getCollaboratorRole");
export const listUserCollaborations = proxy("listUserCollaborations");

// --- Tips ---
export const createTip = proxy("createTip");
export const listTipsReceived = proxy("listTipsReceived");
export const getTipStats = proxy("getTipStats");
