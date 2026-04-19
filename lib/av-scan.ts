import "server-only";

/**
 * Anti-virus / malware scan hook. Two modes:
 *
 *   1. HTTP: POST the file buffer to `AV_SCAN_URL` and check response.
 *      Accepts { clean: true } / { clean: false, reason } JSON.
 *   2. Disabled (default): no-op, returns `clean`.
 *
 * Deployments that need a real scan should run ClamAV as a sidecar and
 * expose it through a thin HTTP adapter. We don't bundle clamd client
 * code here because it would add a hard native dep.
 *
 * Either mode is ENFORCED when `AV_SCAN_ENFORCE=1` — scanner errors
 * then block the upload. Without that flag, a scanner error logs and
 * accepts the file (best-effort). Set ENFORCE in production.
 */

export type AvScanResult = { clean: true } | { clean: false; reason: string; signature?: string };

const MAX_SCAN_BYTES = 100 * 1024 * 1024; // 100 MB ceiling — scanner is not meant for whole movies

export async function scanBufferForMalware(buf: Buffer, filename: string): Promise<AvScanResult> {
  const url = process.env.AV_SCAN_URL;
  if (!url) return { clean: true };
  if (buf.length > MAX_SCAN_BYTES) {
    // Over the scan ceiling. In enforce mode we refuse; otherwise skip
    // and let the admin review workflow catch anything obvious.
    if (process.env.AV_SCAN_ENFORCE === "1") {
      return {
        clean: false,
        reason: `fichier trop volumineux pour le scan AV (${buf.length} > ${MAX_SCAN_BYTES})`,
      };
    }
    return { clean: true };
  }

  try {
    const { timedFetch } = await import("./safe-outbound");
    const res = await timedFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-filename": encodeURIComponent(filename).slice(0, 200),
        ...(process.env.AV_SCAN_TOKEN
          ? { authorization: `Bearer ${process.env.AV_SCAN_TOKEN}` }
          : {}),
      },
      body: buf,
      timeoutMs: 60_000,
    });
    if (!res.ok) {
      throw new Error(`AV scanner HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      clean?: boolean;
      reason?: string;
      signature?: string;
    };
    if (data.clean === true) return { clean: true };
    return {
      clean: false,
      reason: data.reason || "contenu détecté comme malveillant",
      signature: data.signature,
    };
  } catch (err) {
    if (process.env.AV_SCAN_ENFORCE === "1") {
      return {
        clean: false,
        reason: `scanner AV indisponible (${(err as Error).message})`,
      };
    }
    // eslint-disable-next-line no-console
    console.warn("[av-scan] skipped (non-enforce):", err);
    return { clean: true };
  }
}
