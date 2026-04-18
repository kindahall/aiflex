import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed tokens for password reset and email verification.
 *
 * Format: `base64url(payload).hex(hmac_sha256(payload, secret))`
 *
 * Why stateless: with the JSON DB we don't want to add a tokens table that
 * needs cleanup; HMAC tokens carry their own expiry and are revoked
 * implicitly by rotating the secret. The trade-off is that a leaked token
 * is valid until expiry (no server-side revocation), so TTLs are short.
 */

export type TokenPurpose = "password-reset" | "email-verification";

interface TokenPayload {
  sub: string;
  purpose: TokenPurpose;
  iat: number;
  exp: number;
}

let cachedSecret: string | null = null;
let warnedDevSecret = false;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AIFLEX_TOKEN_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  // Dev fallback so the auth flows work without env config. NEVER reach
  // this branch in production — `npm run build` doesn't validate it
  // because it depends on a runtime env var, so the boot logs do.
  if (process.env.NODE_ENV !== "production") {
    cachedSecret = "aiflex-dev-token-secret-not-for-production-use-32+chars";
    if (!warnedDevSecret) {
      // eslint-disable-next-line no-console
      console.warn(
        "[tokens] AIFLEX_TOKEN_SECRET non défini — utilisation du secret de DEV. À configurer en production (>= 16 caractères aléatoires)."
      );
      warnedDevSecret = true;
    }
    return cachedSecret;
  }
  throw new Error(
    "AIFLEX_TOKEN_SECRET requis en production (>= 16 caractères)."
  );
}

export function signToken(
  sub: string,
  purpose: TokenPurpose,
  ttlSeconds: number
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub,
    purpose,
    iat: now,
    exp: now + ttlSeconds,
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

export type VerifyResult =
  | { valid: true; payload: TokenPayload }
  | { valid: false; reason: string };

export function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose
): VerifyResult {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Token manquant" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "Format de token invalide" };
  }
  const [b64, sig] = parts;
  const expected = createHmac("sha256", getSecret()).update(b64).digest("hex");

  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "hex");
    expBuf = Buffer.from(expected, "hex");
  } catch {
    return { valid: false, reason: "Signature illisible" };
  }
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "Signature invalide" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(b64, "base64url").toString("utf8")
    ) as TokenPayload;
  } catch {
    return { valid: false, reason: "Payload illisible" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return { valid: false, reason: "Token expiré" };
  }
  if (payload.purpose !== expectedPurpose) {
    return { valid: false, reason: "Token non destiné à cet usage" };
  }
  return { valid: true, payload };
}
