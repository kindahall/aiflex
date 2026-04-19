import "server-only";

/**
 * TLS certificate pinning for outbound calls to security-critical
 * providers (Stripe, Apple JWKS, Yoti). Mitigates the rare-but-real
 * scenario of a rogue / compromised public CA issuing a fraudulent cert
 * for one of these hosts.
 *
 * Mechanism: an undici Agent (Dispatcher) per host that validates the
 * server's leaf-cert SHA-256 fingerprint against an env-supplied
 * allowlist. Mismatch → connection rejected.
 *
 * Pin format (env): hex SHA-256 of the DER leaf certificate, optionally
 * comma-separated for rotation.
 *   STRIPE_CERT_PINS_SHA256=AB12...,CD34...
 *   APPLE_CERT_PINS_SHA256=...
 *   YOTI_CERT_PINS_SHA256=...
 *
 * To grab a pin from the live cert:
 *   openssl s_client -connect api.stripe.com:443 -servername api.stripe.com \
 *     </dev/null 2>/dev/null | openssl x509 -outform DER \
 *     | openssl dgst -sha256 -hex
 *
 * If no pins are configured for a host, this module is a no-op — the
 * default fetch is used. Operators MUST rotate pins before Stripe / Apple
 * rotate their certs (typically yearly) to avoid an outage.
 */

import { Agent, Dispatcher } from "undici";
import { createHash, X509Certificate } from "node:crypto";
import type { TLSSocket } from "node:tls";
import { log } from "./logger";

interface PinRegistry {
  /** Map of hostname → array of allowed leaf SHA-256 fingerprints (hex). */
  byHost: Map<string, string[]>;
  /** Cached dispatchers — one per host. */
  dispatchers: Map<string, Dispatcher>;
}

const registry: PinRegistry = { byHost: new Map(), dispatchers: new Map() };

function loadPinsFromEnv(host: string, envVar: string): void {
  const raw = process.env[envVar];
  if (!raw) return;
  const pins = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{64}$/.test(s));
  if (pins.length === 0) {
    log.warn("cert-pinning.bad-env", { envVar });
    return;
  }
  registry.byHost.set(host.toLowerCase(), pins);
}

// Register the providers we care about. New providers: add a row here.
loadPinsFromEnv("api.stripe.com", "STRIPE_CERT_PINS_SHA256");
loadPinsFromEnv("appleid.apple.com", "APPLE_CERT_PINS_SHA256");
loadPinsFromEnv("api.yoti.com", "YOTI_CERT_PINS_SHA256");

function fingerprintLeaf(socket: TLSSocket): string | null {
  // Node 17+: prefer the X509Certificate API which gives us DER directly.
  // Older runtimes: fall back to peer certificate's `raw` buffer.
  try {
    const peer = socket.getPeerCertificate(true);
    if (!peer || !peer.raw) return null;
    const x509 = new X509Certificate(peer.raw);
    return createHash("sha256").update(x509.raw).digest("hex");
  } catch {
    return null;
  }
}

function buildDispatcher(host: string, pins: string[]): Dispatcher {
  return new Agent({
    connect: {
      // Keep the OS CA chain check on top of pinning — pinning is
      // additive defense, not a replacement.
      rejectUnauthorized: true,
      // Hook called once the TLS handshake completes; throwing here
      // tears the connection down before any HTTP byte is sent.
      checkServerIdentity: (hostname, cert) => {
        // Default hostname check first.
        const tls = require("node:tls") as typeof import("node:tls");
        const baseError = tls.checkServerIdentity(hostname, cert);
        if (baseError) return baseError;
        try {
          const x509 = new X509Certificate(cert.raw);
          const fp = createHash("sha256").update(x509.raw).digest("hex").toLowerCase();
          if (!pins.includes(fp)) {
            log.error("cert-pinning.mismatch", undefined, {
              host: hostname,
              observed: fp,
              expected: pins,
            });
            return new Error(`cert pin mismatch for ${hostname} (observed ${fp})`);
          }
        } catch (e) {
          return e as Error;
        }
        return undefined;
      },
    },
  });
}

/**
 * Returns a pinned dispatcher for the given URL host, or undefined if no
 * pins are configured (caller should fall back to default fetch).
 */
export function pinnedDispatcherFor(url: string | URL): Dispatcher | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const pins = registry.byHost.get(host);
  if (!pins) return undefined;
  let d = registry.dispatchers.get(host);
  if (!d) {
    d = buildDispatcher(host, pins);
    registry.dispatchers.set(host, d);
  }
  return d;
}

/** Test/diag helper. */
export function _hasPinsFor(host: string): boolean {
  return registry.byHost.has(host.toLowerCase());
}

// Suppress the unused-import warning when the module hasn't loaded any pins.
void fingerprintLeaf;
