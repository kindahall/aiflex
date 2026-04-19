import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Storage Abstraction Layer
// ---------------------------------------------------------------------------

export interface StorageProvider {
  upload(key: string, body: Buffer, contentType: string): Promise<string>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Local Storage (dev default)
// ---------------------------------------------------------------------------

class LocalStorage implements StorageProvider {
  // In production this class is never selected (S3Storage takes over when
  // S3_BUCKET is set). In dev we write to `private-uploads/` so files are
  // NOT served statically by Next.js at `/uploads/*` — the caller must go
  // through a signed URL endpoint that enforces auth + expiry.
  //
  // For backwards compat with demo flows, callers whose key starts with
  // `public/` go to the public directory.
  private privateDir = path.join(process.cwd(), ".storage", "private");
  private publicDir = path.join(process.cwd(), "public", "uploads");

  private isPublicKey(key: string): boolean {
    return key.startsWith("public/");
  }

  private pathFor(key: string): string {
    return this.isPublicKey(key)
      ? path.join(this.publicDir, key.slice("public/".length))
      : path.join(this.privateDir, key);
  }

  async upload(key: string, body: Buffer, _contentType: string): Promise<string> {
    const filePath = this.pathFor(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body);
    if (this.isPublicKey(key)) {
      return `/uploads/${key.slice("public/".length)}`;
    }
    // Private: expose through the authenticated signed-url endpoint.
    return this.getSignedUrl(key);
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    if (this.isPublicKey(key)) {
      return `/uploads/${key.slice("public/".length)}`;
    }
    const { signLocalUrl } = await import("./local-storage-sign");
    return signLocalUrl(key, expiresInSeconds);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.pathFor(key);
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore if not found
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.pathFor(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export const LOCAL_PRIVATE_DIR = path.join(process.cwd(), ".storage", "private");

// ---------------------------------------------------------------------------
// AWS Signature V4 helpers (no SDK)
// ---------------------------------------------------------------------------

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function toAmzDate(d: Date): { amzDate: string; dateStamp: string } {
  const iso = d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

interface SignedRequestInit {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  service?: string;
}

function signRequest(opts: SignedRequestInit): Record<string, string> {
  const service = opts.service || "s3";
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const parsedUrl = new URL(opts.url);

  // Normalize all header keys to lowercase for canonical signing
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers)) {
    headers[k.toLowerCase()] = v;
  }
  headers["host"] = parsedUrl.host;
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = sha256Hex(opts.body || "");

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");

  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}`).join("\n") + "\n";

  const canonicalQueryString = [...parsedUrl.searchParams]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalRequest = [
    opts.method,
    parsedUrl.pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    sha256Hex(opts.body || ""),
  ].join("\n");

  const credentialScope = `${dateStamp}/${opts.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(opts.secretAccessKey, dateStamp, opts.region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { ...headers, Authorization: authHeader };
}

function buildPresignedUrl(opts: {
  bucket: string;
  key: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  expiresIn: number;
}): string {
  const service = "s3";
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);

  const host = opts.endpoint
    ? new URL(opts.endpoint).host
    : `${opts.bucket}.s3.${opts.region}.amazonaws.com`;
  const baseUrl = opts.endpoint
    ? `${opts.endpoint}/${opts.bucket}/${opts.key}`
    : `https://${host}/${opts.key}`;

  const credentialScope = `${dateStamp}/${opts.region}/${service}/aws4_request`;
  const credential = `${opts.accessKeyId}/${credentialScope}`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(opts.expiresIn),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalQueryString = [...params]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const parsedBase = new URL(baseUrl);
  const canonicalRequest = [
    "GET",
    parsedBase.pathname,
    canonicalQueryString,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(opts.secretAccessKey, dateStamp, opts.region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return `${parsedBase.origin}${parsedBase.pathname}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// ---------------------------------------------------------------------------
// S3 Storage (works with AWS S3 and Cloudflare R2)
// ---------------------------------------------------------------------------

class S3Storage implements StorageProvider {
  private bucket: string;
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private endpoint?: string;
  private publicUrl?: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET!;
    this.region = process.env.S3_REGION || "auto";
    this.accessKeyId = process.env.S3_ACCESS_KEY_ID!;
    this.secretAccessKey = process.env.S3_SECRET_ACCESS_KEY!;
    this.endpoint = process.env.S3_ENDPOINT || undefined;
    this.publicUrl = process.env.S3_PUBLIC_URL || undefined;
  }

  private getHost(): string {
    if (this.endpoint) return new URL(this.endpoint).host;
    return `${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  private getObjectUrl(key: string): string {
    if (this.endpoint) {
      return `${this.endpoint}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    const url = this.getObjectUrl(key);
    const headers = signRequest({
      method: "PUT",
      url,
      headers: { "content-type": contentType },
      body,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });

    const resp = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "content-length": String(body.length) },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`S3 PUT failed (${resp.status}): ${text}`);
    }

    // Return public URL if configured, otherwise a signed URL
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return this.getSignedUrl(key);
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return buildPresignedUrl({
      bucket: this.bucket,
      key,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      endpoint: this.endpoint,
      expiresIn,
    });
  }

  async delete(key: string): Promise<void> {
    const url = this.getObjectUrl(key);
    const headers = signRequest({
      method: "DELETE",
      url,
      headers: {},
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });

    const resp = await fetch(url, { method: "DELETE", headers });
    if (!resp.ok && resp.status !== 404) {
      const text = await resp.text();
      throw new Error(`S3 DELETE failed (${resp.status}): ${text}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const url = this.getObjectUrl(key);
    const headers = signRequest({
      method: "HEAD",
      url,
      headers: {},
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });

    const resp = await fetch(url, { method: "HEAD", headers });
    return resp.ok;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!_instance) {
    _instance = process.env.S3_BUCKET ? new S3Storage() : new LocalStorage();
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Canonical key paths (V7 §9.4)
// ---------------------------------------------------------------------------

export const storagePaths = {
  filmOutput: (id: string) => `films/${id}/output.mp4`,
  filmThumbnail: (id: string) => `films/${id}/thumbnail.jpg`,
  filmClip: (id: string, jobId: string) => `films/${id}/clips/${jobId}.mp4`,
  episodeOutput: (id: string) => `episodes/${id}/output.mp4`,
  episodeThumbnail: (id: string) => `episodes/${id}/thumbnail.jpg`,
  characterPreview: (jobId: string, i: number) => `previews/${jobId}/char-${i}.webp`,
  characterReference: (characterId: string) => `characters/${characterId}/reference.webp`,
  uploadedFilm: (id: string) => `uploads/${id}/original.mp4`,
  subtitle: (projectId: string, lang: string) => `subtitles/${projectId}/${lang}.vtt`,
  dubAudio: (projectId: string, lang: string) => `dubs/${projectId}/${lang}.mp3`,
  adCreative: (campaignId: string, ext: string) => `ads/${campaignId}/creative.${ext}`,
  backup: (stamp: string) => `backups/${stamp}.sql.gpg`,
};

// ---------------------------------------------------------------------------
// Convenience uploaders
// ---------------------------------------------------------------------------

/**
 * Upload a local file (e.g. Remotion MP4 render output, ffmpeg intermediate)
 * to the configured storage. Returns the resulting public or signed URL.
 */
export async function uploadFromPath(
  localPath: string,
  key: string,
  contentType: string
): Promise<string> {
  const { promises: fs } = await import("node:fs");
  const buf = await fs.readFile(localPath);
  return getStorage().upload(key, buf, contentType);
}

/**
 * Fetch a remote URL (e.g. Replicate/Flux image, Seedance clip MP4) and
 * re-upload it to our storage at `key`. Useful because model providers
 * routinely garbage-collect their output URLs after 24-72h.
 *
 * SSRF defense: the URL is validated against an allowlist of provider
 * hosts before we hit the network. That blocks exfil attempts against
 * internal IPs (169.254.169.254 cloud metadata, 127.0.0.1, RFC 1918…)
 * even if a user-controlled URL ever reaches this path.
 */
export async function uploadFromUrl(
  sourceUrl: string,
  key: string,
  fallbackContentType = "application/octet-stream"
): Promise<string> {
  const { assertSafeOutboundUrl } = await import("./safe-fetch");
  await assertSafeOutboundUrl(sourceUrl);

  const resp = await fetch(sourceUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    throw new Error(`uploadFromUrl: fetch failed (${resp.status}) for ${sourceUrl}`);
  }
  const contentType = resp.headers.get("content-type") || fallbackContentType;
  const MAX_BYTES = 500 * 1024 * 1024; // 500MB ceiling
  const lenHeader = Number(resp.headers.get("content-length") || 0);
  if (lenHeader > MAX_BYTES) {
    throw new Error("uploadFromUrl: remote file exceeds 500MB limit");
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    throw new Error("uploadFromUrl: remote file exceeds 500MB limit");
  }
  return getStorage().upload(key, buf, contentType);
}

/**
 * Upload a Buffer directly. Thin wrapper preserved for V7 API compat.
 */
export function uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
  return getStorage().upload(key, buffer, contentType);
}

// ---------------------------------------------------------------------------
// Signed CDN URLs for premium / private-circle content (V8 §B7.3)
// ---------------------------------------------------------------------------

/**
 * Generate a time-limited signed URL for a private asset. For Backblaze B2
 * + Cloudflare public bucket, this delegates to the S3 presign. For truly
 * private buckets, pair this with a Cloudflare Worker that verifies a
 * separate HMAC token (not implemented here — requires CF deployment).
 */
export async function signedContentUrl(
  key: string,
  expiresInSeconds = 4 * 60 * 60
): Promise<string> {
  return getStorage().getSignedUrl(key, expiresInSeconds);
}
