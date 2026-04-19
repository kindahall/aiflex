import "server-only";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF guard for outbound fetches whose URL can be influenced by users
 * (model output references, image-to-video imageUrl, etc.).
 *
 * Defense layers:
 *   1. Protocol must be http(s) — no file://, ftp://, gopher://...
 *   2. Host must either be on the provider allowlist, or its resolved
 *      IP must NOT be in any private / loopback / link-local / cloud
 *      metadata range.
 *   3. DNS rebinding is mitigated by resolving the host here, but the
 *      underlying `fetch` still resolves again. To be fully safe, callers
 *      should pair this with a connect-level IP check (not possible on
 *      Node's default `fetch`). The allowlist below is the primary
 *      defense.
 */

const ALLOWED_HOSTS = new Set<string>([
  // AI providers we legitimately pull assets from
  "fal.media",
  "v3.fal.media",
  "v2.fal.media",
  "cdn.fal.media",
  "replicate.delivery",
  "replicate.com",
  "pbxt.replicate.delivery",
  "files.stability.ai",
  "cdn.openai.com",
  "oaidalleapiprodscus.blob.core.windows.net",
  "api.elevenlabs.io",
  "api.sync.so",
  "cdn.suno.ai",
  "audiopipe.suno.ai",
  "storage.googleapis.com",
  "anthropic-public.s3.amazonaws.com",
  "cdn.midjourney.com",
  "runway-upload.s3.amazonaws.com",
  "runway-generated.s3.amazonaws.com",
]);

function isHostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  // Wildcard suffix match for a few provider-prefixed subdomains.
  for (const allowed of ALLOWED_HOSTS) {
    if (h === allowed || h.endsWith(`.${allowed}`)) return true;
  }
  // S3/B2-style bucket subdomains of our own storage backend — the operator
  // can extend this via env if they self-host behind another domain.
  const extra = (process.env.SSRF_ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const a of extra) {
    if (h === a || h.endsWith(`.${a}`)) return true;
  }
  return false;
}

function ipIsForbidden(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS/GCP/Azure metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("ff")) return true; // multicast
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice("::ffff:".length);
      if (isIP(v4) === 4) return ipIsForbidden(v4);
    }
    return false;
  }
  return true;
}

export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL invalide");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Protocole non autorisé: ${url.protocol}`);
  }

  const host = url.hostname;
  if (!host) throw new Error("Hostname manquant");

  // Direct-IP requests are blocked unless env-allowed for testing.
  if (isIP(host) !== 0) {
    if (ipIsForbidden(host)) {
      throw new Error("Adresse IP interdite (réseau privé)");
    }
    if (!isHostAllowed(host)) {
      throw new Error(`Hôte non autorisé: ${host}`);
    }
    return url;
  }

  if (!isHostAllowed(host)) {
    throw new Error(`Hôte non autorisé: ${host}`);
  }

  // Even for allowlisted hosts, resolve DNS and confirm none of the answers
  // point at a private range — defense against rogue DNS / takeover.
  let resolved: string[];
  try {
    const lookup = await dns.lookup(host, { all: true });
    resolved = lookup.map((r) => r.address);
  } catch {
    throw new Error(`Résolution DNS impossible pour ${host}`);
  }
  for (const ip of resolved) {
    if (ipIsForbidden(ip)) {
      throw new Error(`Hôte ${host} résout vers un réseau privé (${ip}) — bloqué`);
    }
  }

  return url;
}
