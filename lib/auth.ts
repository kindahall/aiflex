import "server-only";
import { cookies, headers } from "next/headers";
import {
  createSession as dbCreateSession,
  deleteSession as dbDeleteSession,
  findSession,
  findUserById,
  toPublicUser,
} from "./server-db";
import { getTrustedClientIp } from "./client-ip";
import type { User, UserRecord } from "./types";

// __Host- prefix binds the cookie to this exact origin (no subdomain
// sharing, path=/, secure required). In production we use it by default;
// dev falls back to a plain name so http://localhost works.
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-aiflex_session" : "aiflex_session";

const COOKIE_OPTIONS = {
  httpOnly: true,
  // "strict" blocks cross-origin POST requests that carry our session
  // cookie — primary CSRF defense. OAuth redirects land on our own origin
  // so they still work; only third-party-initiated state mutations are cut.
  sameSite: "strict" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  // 14 days — balance between "don't make people log in every Monday"
  // and "minimize blast radius of a stolen cookie". The session row in
  // the DB has its own expiry too.
  maxAge: 60 * 60 * 24 * 14,
};

export async function startSession(userId: string): Promise<void> {
  // Capture session metadata for the user-facing "active sessions" panel
  // and for hijack detection. Read from the current request headers via
  // the Next.js headers() API.
  let ipAddress: string | undefined;
  let userAgent: string | undefined;
  try {
    const h = await headers();
    const reqLike = { headers: { get: (n: string) => h.get(n) } };
    const ip = getTrustedClientIp(reqLike);
    if (ip && ip !== "anonymous") ipAddress = ip;
    const ua = h.get("user-agent");
    if (ua) userAgent = ua;
  } catch {
    /* headers() unavailable in non-request contexts */
  }
  const session = await dbCreateSession(userId, { ipAddress, userAgent });
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
  if (user.role !== "admin") throw new AuthError("Droits administrateur requis", 403);
  return user;
}
