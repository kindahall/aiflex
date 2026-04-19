import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Tuned for 2026: N=131072 (cost 17), r=8, p=1, maxmem lifted to match.
// Node's default N=16384 was too weak for modern GPU-assisted attackers.
const SCRYPT_COST = 17;
const SCRYPT_N = 1 << SCRYPT_COST;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: {
    N?: number;
    r?: number;
    p?: number;
    maxmem?: number;
  }
) => Promise<Buffer>;

const KEY_LEN = 64;

// Hash format: `scrypt$N$r$p$<hex(salt)>$<hex(hash)>` — forward-compatible
// with future KDF bumps (bcrypt/argon2 can co-exist under the same prefix
// router).
const PREFIX = "scrypt$";

async function deriveScrypt(
  password: string,
  salt: string,
  N = SCRYPT_N,
  r = SCRYPT_R,
  p = SCRYPT_P
): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LEN, {
    N,
    r,
    p,
    maxmem: SCRYPT_MAXMEM,
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = await deriveScrypt(password, salt);
  return `${PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${buf.toString("hex")}`;
}

export async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
  try {
    if (stored.startsWith(PREFIX)) {
      const rest = stored.slice(PREFIX.length);
      const [nStr, rStr, pStr, salt, hash] = rest.split("$");
      const N = Number(nStr);
      const r = Number(rStr);
      const p = Number(pStr);
      if (!salt || !hash || !Number.isFinite(N)) return false;
      const hashedBuf = Buffer.from(hash, "hex");
      const candidateBuf = await deriveScrypt(candidate, salt, N, r, p);
      return hashedBuf.length === candidateBuf.length && timingSafeEqual(hashedBuf, candidateBuf);
    }
    // Legacy format: `<hex(hash)>.<hex(salt)>` with Node defaults.
    const [hashed, salt] = stored.split(".");
    if (!hashed || !salt) return false;
    const hashedBuf = Buffer.from(hashed, "hex");
    const candidateBuf = await scryptAsync(candidate, salt, KEY_LEN, {});
    return hashedBuf.length === candidateBuf.length && timingSafeEqual(hashedBuf, candidateBuf);
  } catch {
    return false;
  }
}

/**
 * Run a scrypt derivation against a throwaway salt so handlers can pay
 * the same CPU cost whether or not the candidate user exists. Kills the
 * login timing-enumeration channel.
 */
export async function dummyVerifyPassword(candidate: string): Promise<void> {
  await deriveScrypt(candidate, "a".repeat(32)).catch(() => {});
}
