import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Minimal TOTP (RFC 6238) implementation — no external dependencies.
 * Generates and verifies 6-digit time-based one-time passwords.
 */

const DIGITS = 6;
const PERIOD = 30; // seconds
const ALGORITHM = "SHA-1";

const BACKUP_CODE_HASH_PREFIX = "sha256$";

/** Hash a backup code for at-rest storage. Plaintext is only shown once. */
export function hashBackupCode(code: string): string {
  return BACKUP_CODE_HASH_PREFIX + createHash("sha256").update(code.trim()).digest("hex");
}

export function isHashedBackupCode(value: string): boolean {
  return typeof value === "string" && value.startsWith(BACKUP_CODE_HASH_PREFIX);
}

function ctStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Verify a candidate backup code against a stored entry. Accepts both
 * hashed (new) and plaintext (legacy) stored values so already-enrolled
 * users are not locked out during migration.
 */
export function verifyBackupCode(stored: string, candidate: string): boolean {
  if (isHashedBackupCode(stored)) {
    return ctStringEqual(stored, hashBackupCode(candidate));
  }
  return ctStringEqual(stored, candidate.trim());
}

/** Generate a random base32-encoded secret. */
export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/** Generate backup codes (8 random 8-digit codes). */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    const num = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
    codes.push(String(num % 100000000).padStart(8, "0"));
  }
  return codes;
}

/** Build an otpauth:// URI for QR code generation. */
export function buildOtpAuthUri(secret: string, email: string, issuer = "AIflex"): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=${ALGORITHM}&digits=${DIGITS}&period=${PERIOD}`;
}

/** Verify a TOTP code against a secret. Allows ±1 period drift. */
export async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  for (let offset = -1; offset <= 1; offset++) {
    const counter = Math.floor((now + offset * PERIOD) / PERIOD);
    const expected = await generateTOTPCode(secret, counter);
    if (expected === code) return true;
  }
  return false;
}

async function generateTOTPCode(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(4, counter, false);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBuf));

  // Dynamic truncation (RFC 4226)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, DIGITS);
  return String(otp).padStart(DIGITS, "0");
}

// --- Base32 helpers -------------------------------------------------------

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function base32Decode(input: string): Uint8Array {
  const cleanInput = input.replace(/=+$/, "").toUpperCase();
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleanInput) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}
