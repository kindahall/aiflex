/**
 * Client IP resolution for edge middleware and Node handlers.
 *
 * Problem: `X-Forwarded-For` is a user-controllable header. Trusting its
 * left-most value lets any attacker advertise a different IP per request
 * and bypass rate-limits, IP allowlists, abuse tracking, etc.
 *
 * Strategy:
 *   - When the infrastructure has a trusted reverse-proxy, it sets
 *     `TRUSTED_PROXY_SECRET` on us and includes `x-proxy-secret` on every
 *     proxied request. In that path we parse `x-forwarded-for` normally.
 *   - Otherwise we use the right-most IP in the chain (the one the edge
 *     saw directly), which cannot be influenced by the client. If no
 *     proxy headers exist, we fall back to the request's remote address.
 *
 * Call `getTrustedClientIp(request)` anywhere you need an IP you can hold
 * an attacker accountable for. `getClientIpForLogs(request)` is the
 * permissive variant for non-security paths (only for display).
 */

export interface IpRequest {
  headers: { get(name: string): string | null };
}

/**
 * Constant-time string equality implemented without `node:crypto` so this
 * module remains importable from the Edge runtime (middleware).
 */
function proxySecretMatches(header: string, expected: string): boolean {
  if (!header || !expected) return false;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) {
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function parseXff(header: string): string[] {
  return header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getTrustedClientIp(req: IpRequest): string {
  const expected = process.env.TRUSTED_PROXY_SECRET || "";
  const provided = req.headers.get("x-proxy-secret") || "";
  const trustHeaders = expected && proxySecretMatches(provided, expected);

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const chain = parseXff(xff);
    if (trustHeaders) {
      return chain[0] || "anonymous";
    }
    // Untrusted — only the right-most hop is guaranteed not to be
    // client-controlled (assuming one proxy in front of the app).
    return chain[chain.length - 1] || "anonymous";
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && trustHeaders) return realIp.trim();

  // Edge runtime exposes request.ip on NextRequest; Node runtime does not.
  const anyReq = req as unknown as { ip?: string };
  if (anyReq.ip) return anyReq.ip;

  return "anonymous";
}

/** Convenience alias used in logging where a stable identifier is enough. */
export const getClientIpForLogs = getTrustedClientIp;
