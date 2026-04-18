import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, KEY_LEN);
  return `${buf.toString("hex")}.${salt}`;
}

export async function verifyPassword(
  stored: string,
  candidate: string
): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  try {
    const hashedBuf = Buffer.from(hashed, "hex");
    const candidateBuf = await scryptAsync(candidate, salt, KEY_LEN);
    return (
      hashedBuf.length === candidateBuf.length &&
      timingSafeEqual(hashedBuf, candidateBuf)
    );
  } catch {
    return false;
  }
}
