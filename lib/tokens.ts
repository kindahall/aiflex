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

export type TokenPurpose = "password-reset" | "email-verification" | "2fa-challenge";

interface TokenPayload {
  sub: string;
  purpose: TokenPurpose;
  iat: number;
  exp: number;
  /**
   * Optional binding — short fingerprint of server-side state (e.g.
   * current password hash) that must still match at verify time.
   * Lets a stateless token be invalidated by a state change without
   * a revocation store: once the bound state rotates, the token is dead.
   */
  bind?: string;
}

let cachedSecrets: string[] | null = null;
let warnedDevSecret = false;

/**
 * The dev fallback is only safe on an actual developer workstation. Staging
 * and preview deployments routinely run without `NODE_ENV=production` set
 * correctly — trusting NODE_ENV alone has historically caused takeovers
 * where attackers forged reset tokens because the preview tier shipped
 * with the known fallback secret.
 *
 * We therefore require BOTH: NODE_ENV !== "production" AND one of the
 * explicit dev hints (local host, env flag). Anything else throws.
 */
function isDefinitelyLocalDev(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.AIFLEX_ALLOW_DEV_TOKEN_SECRET === "1") return true;
  const host = process.env.HOSTNAME || "";
  const vercel = process.env.VERCEL_ENV || ""; // "production" | "preview" | "development"
  if (vercel && vercel !== "development") return false;
  if (host === "localhost" || host.startsWith("127.")) return true;
  // Default conservative: require explicit opt-in for unknown hosts.
  return !process.env.VERCEL_ENV && !process.env.CI;
}

/**
 * Secret rotation: `AIFLEX_TOKEN_SECRET` may be a single string OR a
 * comma-separated list `current,previous,older`. Signatures are always
 * made with the first entry; verification accepts any entry. This lets
 * operators rotate secrets without invalidating in-flight reset / verify
 * tokens — roll for an hour or two with both, then remove the old one.
 */
function getSecrets(): string[] {
  if (cachedSecrets) return cachedSecrets;
  const raw = process.env.AIFLEX_TOKEN_SECRET;
  if (raw) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tooShort = parts.find((p) => p.length < 32);
    if (tooShort) {
      throw new Error(
        "AIFLEX_TOKEN_SECRET trop court — chaque entrée doit faire au moins 32 caractères aléatoires."
      );
    }
    if (parts.length > 0) {
      cachedSecrets = parts;
      return cachedSecrets;
    }
  }
  if (isDefinitelyLocalDev()) {
    cachedSecrets = ["aiflex-dev-token-secret-not-for-production-use-32+chars"];
    if (!warnedDevSecret) {
      // eslint-disable-next-line no-console
      console.warn(
        "[tokens] AIFLEX_TOKEN_SECRET non défini — secret DEV utilisé (poste local uniquement)."
      );
      warnedDevSecret = true;
    }
    return cachedSecrets;
  }
  throw new Error(
    "AIFLEX_TOKEN_SECRET requis (>= 32 caractères aléatoires). Le fallback DEV est désactivé hors poste local."
  );
}

function getSigningSecret(): string {
  return getSecrets()[0];
}

export function signToken(
  sub: string,
  purpose: TokenPurpose,
  ttlSeconds: number,
  options: { bind?: string } = {}
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub,
    purpose,
    iat: now,
    exp: now + ttlSeconds,
    ...(options.bind ? { bind: options.bind } : {}),
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = createHmac("sha256", getSigningSecret()).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

/** 12-char fingerprint of arbitrary server state, safe to embed in a token. */
export function fingerprintState(state: string): string {
  return createHmac("sha256", getSigningSecret()).update(state).digest("hex").slice(0, 12);
}

export type VerifyResult =
  | { valid: true; payload: TokenPayload }
  | { valid: false; reason: string };

export function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose,
  options: { expectedBind?: string } = {}
): VerifyResult {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Token manquant" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "Format de token invalide" };
  }
  const [b64, sig] = parts;

  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "hex");
  } catch {
    return { valid: false, reason: "Signature illisible" };
  }

  // Try each active secret (current + any pending-rotation older secrets).
  // All comparisons are constant-time — we never short-circuit on length.
  let matched = false;
  for (const secret of getSecrets()) {
    const expected = createHmac("sha256", secret).update(b64).digest("hex");
    let expBuf: Buffer;
    try {
      expBuf = Buffer.from(expected, "hex");
    } catch {
      continue;
    }
    if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    return { valid: false, reason: "Signature invalide" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as TokenPayload;
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
  if (options.expectedBind !== undefined) {
    const bind = payload.bind ?? "";
    const a = Buffer.from(bind, "utf8");
    const b = Buffer.from(options.expectedBind, "utf8");
    const matches = a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
    if (!matches) {
      return { valid: false, reason: "Token déjà utilisé ou invalidé" };
    }
  }
  return { valid: true, payload };
}
