import "server-only";
import { cookies } from "next/headers";
import {
  createSession as dbCreateSession,
  deleteSession as dbDeleteSession,
  findSession,
  findUserById,
  toPublicUser,
} from "./server-db";
import type { User, UserRecord } from "./types";

export const SESSION_COOKIE = "aiflex_session";

const COOKIE_OPTIONS = {
  httpOnly: true,
  // "strict" blocks cross-origin POST requests that carry our session
  // cookie — primary CSRF defense. OAuth redirects land on our own origin
  // so they still work; only third-party-initiated state mutations are cut.
  sameSite: "strict" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export async function startSession(userId: string): Promise<void> {
  const session = await dbCreateSession(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, COOKIE_OPTIONS);
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await dbDeleteSession(token);
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user || user.suspended) return null;
  return toPublicUser(user);
}

/** Same as getCurrentUser but returns the DB record (with passwordHash). Never ship. */
export async function getCurrentUserRecord(): Promise<UserRecord | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user || user.suspended) return null;
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Authentification requise", 401);
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin")
    throw new AuthError("Droits administrateur requis", 403);
  return user;
}
