import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed URL for the LocalStorage provider. The URL encodes the
 * key + expiry and an HMAC, so the /api/storage/local serving route can
 * verify without a server-side session. Mirrors S3 presigned-URL semantics
 * at dev scale.
 */

const ENV_SECRET = "AIFLEX_LOCAL_STORAGE_SECRET";

function getSecret(): string {
  const s = process.env[ENV_SECRET];
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${ENV_SECRET} requis en production — redirection des fichiers privés.`);
  }
  // Dev only fallback — ties to token secret concept but isolated.
  return "aiflex-dev-local-storage-secret-16+chars";
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signLocalUrl(key: string, ttlSec: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${key}|${exp}`;
  const sig = b64url(createHmac("sha256", getSecret()).update(payload).digest());
  const qs = new URLSearchParams({
    key,
    exp: String(exp),
    sig,
  });
  return `/api/storage/local?${qs.toString()}`;
}

export function verifyLocalUrl(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp)) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const expected = b64url(createHmac("sha256", getSecret()).update(`${key}|${exp}`).digest());
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
