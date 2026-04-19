import "server-only";

/**
 * Magic-byte sniffing for uploaded files. The client-supplied `Content-Type`
 * is attacker-controlled — a polyglot file served from /uploads/ could
 * deliver XSS, malware, or flash-era exploits. We double-check the bytes
 * match the declared MIME before persisting.
 */

export type SupportedMime = "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm";

export function sniffMime(buf: Buffer): SupportedMime | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }

  // MP4: 00 00 00 ?? 66 74 79 70 (ftyp)
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return "video/mp4";
  }

  // WebM / Matroska: EBML header 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return "video/webm";
  }

  return null;
}

export function mimeMatches(declared: string, sniffed: SupportedMime | null): boolean {
  if (!sniffed) return false;
  return declared === sniffed;
}
