import "server-only";
import { assertSafeOutboundUrl } from "./safe-fetch";

/**
 * Pluggable Dolby Atmos provider interface.
 *
 * Real Dolby Atmos encoding cannot be done in FOSS — it requires either
 * a local Dolby Reference Encoder (commercial, €5k+/year) or a cloud
 * transcoding service. This module abstracts both so the compose
 * pipeline just says "give me Atmos" and the provider handles the rest.
 *
 * Providers:
 *   - "dolbyio"     — Dolby.io Media API (commercial, per-minute pricing).
 *                     Requires DOLBY_IO_API_KEY. Uploads source, requests
 *                     E-AC-3 JOC (Atmos) transcode, downloads result.
 *   - "reference"   — Local Dolby Reference Encoder binary. Requires
 *                     DOLBY_REFERENCE_ENCODER_PATH + license file.
 *   - "none" (def.) — No provider; caller falls back to atmos-stub.
 *
 * Selected via env var AIFLEX_ATMOS_PROVIDER.
 */

export type AtmosProviderId = "none" | "dolbyio" | "reference";

export interface AtmosTranscodeResult {
  /** True when a real Atmos-encoded file was produced or submitted. */
  real: boolean;
  /** Provider actually used (or "none" if fell through). */
  provider: AtmosProviderId;
  /**
   * Local path of the output. When real=false, caller should keep the
   * input and mark the warning — no file is written by the provider.
   * When pending=true, this is also unset (the file won't exist until
   * the webhook triggers a download).
   */
  outputPath?: string;
  reason?: string;
  /**
   * True when the job was submitted asynchronously (webhook mode) and
   * the output isn't available yet. Callers must not expect a file at
   * `outputPath`; they should flip the project's `audioLayoutStatus` to
   * "pending-atmos" and rely on the webhook to persist the final output.
   */
  pending?: boolean;
  /** Dolby.io `job_id` — non-empty when pending=true. */
  jobId?: string;
}

export function currentAtmosProvider(): AtmosProviderId {
  const id = (process.env.AIFLEX_ATMOS_PROVIDER || "").toLowerCase();
  if (id === "dolbyio" || id === "reference") return id;
  return "none";
}

/**
 * Transcode a mixed audio/video source to real Dolby Atmos via the
 * configured provider. Returns `{ real: false, provider: "none" }` when
 * no provider is configured — caller then chooses atmos-stub fallback.
 */
export async function transcodeToAtmos(args: {
  inputPath: string;
  outputPath: string;
  /**
   * Project + owner ids — only consulted in async/webhook mode to
   * correlate the returned `jobId` with a DolbyIOJob row. Safe to omit
   * in tests or call-sites that never enter async mode.
   */
  projectId?: string;
  ownerId?: string;
}): Promise<AtmosTranscodeResult> {
  const provider = currentAtmosProvider();
  switch (provider) {
    case "dolbyio":
      return transcodeDolbyIO(args);
    case "reference":
      return transcodeReferenceEncoder(args);
    case "none":
    default:
      return {
        real: false,
        provider: "none",
        reason:
          "No Atmos provider configured. Set AIFLEX_ATMOS_PROVIDER=dolbyio + DOLBY_IO_API_KEY, or AIFLEX_ATMOS_PROVIDER=reference + DOLBY_REFERENCE_ENCODER_PATH.",
      };
  }
}

// ---------------------------------------------------------------------------
// Dolby.io Media API — cloud provider
// ---------------------------------------------------------------------------
//
// The Media API flow:
//   1. POST /v1/auth/token  → short-lived access token from API key + secret
//   2. PUT  /v1/media/input → receive presigned URL, upload source
//   3. POST /v1/media/transcode/jobs  with Atmos preset (`dde` / `edge`)
//   4. GET  /v1/media/transcode/{jobId} → poll until Succeeded
//   5. GET  /v1/media/output → presigned download URL
//
// Pricing: ~$0.30 per output minute for Atmos JOC transcode.
// Docs:    https://docs.dolby.io/media-apis/docs/dolby-atmos

const DOLBY_IO_BASE = "https://api.dolby.com";

async function transcodeDolbyIO(args: {
  inputPath: string;
  outputPath: string;
  projectId?: string;
  ownerId?: string;
}): Promise<AtmosTranscodeResult> {
  const apiKey = process.env.DOLBY_IO_API_KEY;
  const apiSecret = process.env.DOLBY_IO_API_SECRET;
  if (!apiKey || !apiSecret) {
    return {
      real: false,
      provider: "dolbyio",
      reason: "DOLBY_IO_API_KEY / DOLBY_IO_API_SECRET missing",
    };
  }

  // Prefer the official Dolby.io SDK when it's installed: typed surface,
  // automatic retries, better error messages, tracks API-version bumps
  // without code changes. Fall back to the fetch-based implementation if
  // the SDK is absent (lets the build keep working during the transition
  // and lets downstream forks skip the dependency if they want).
  const sdk = await loadDolbyIoSdk();
  if (sdk) {
    try {
      return await runDolbyIOJobViaSdk(sdk, apiKey, apiSecret, args);
    } catch (err) {
      return {
        real: false,
        provider: "dolbyio",
        reason: err instanceof Error ? err.message : "dolby.io SDK call failed",
      };
    }
  }

  // --- Fetch-based fallback (kept verbatim for backward compat) ---
  try {
    // Step 1: OAuth2 client-credentials grant
    const tokenRes = await fetch(`${DOLBY_IO_BASE}/v1/auth/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&expires_in=600",
      signal: AbortSignal.timeout(30_000),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return {
        real: false,
        provider: "dolbyio",
        reason: `auth failed (${tokenRes.status}): ${text.slice(0, 200)}`,
      };
    }
    const { access_token: token } = (await tokenRes.json()) as {
      access_token: string;
    };

    // Step 2-5: upload → transcode → download. Each step has retry needs
    // and presigned URL TTLs; wrapping in a helper keeps this readable.
    const out = await runDolbyIOJob(token, args.inputPath, args.outputPath);
    return out;
  } catch (err) {
    return {
      real: false,
      provider: "dolbyio",
      reason: err instanceof Error ? err.message : "dolby.io request failed",
    };
  }
}

// Dolby.io SDK — optional dependency loaded dynamically. Falling back to
// `fetch` when it's absent keeps the build deterministic for forks that
// don't want the SDK. The type is intentionally loose — the SDK ships
// its own types, but pinning them here would make the fallback path
// force-install the package. A minimal structural type is enough.
type DolbyIoSdk = {
  media: {
    authentication: {
      getApiAccessToken: (
        key: string,
        secret: string,
        expiresIn?: number
      ) => Promise<{ access_token: string } | string>;
    };
    io: {
      uploadFile: (token: unknown, dlbUrl: string, filePath: string) => Promise<void>;
      downloadFile: (token: unknown, dlbUrl: string, filePath: string) => Promise<void>;
    };
    transcode: {
      start: (token: unknown, jobContent: string) => Promise<string | null>;
      getResults: (
        token: unknown,
        jobId: string
      ) => Promise<{
        status: string;
        progress?: number;
        error?: { details?: string; title?: string };
      }>;
    };
  };
};

async function loadDolbyIoSdk(): Promise<DolbyIoSdk | null> {
  try {
    // Dynamic import keeps this a runtime dependency check. If the
    // package isn't installed, the import throws and we return null.
    const mod = (await import(
      /* @vite-ignore */ "@dolbyio/dolbyio-rest-apis-client"
    )) as unknown as DolbyIoSdk;
    if (mod && mod.media && mod.media.transcode) return mod;
    return null;
  } catch {
    return null;
  }
}

async function runDolbyIOJobViaSdk(
  sdk: DolbyIoSdk,
  apiKey: string,
  apiSecret: string,
  args: { inputPath: string; outputPath: string; projectId?: string; ownerId?: string }
): Promise<AtmosTranscodeResult> {
  // 1. JWT — 30-min expiry is more than enough for a single job.
  const token = await sdk.media.authentication.getApiAccessToken(apiKey, apiSecret, 1800);

  // 2. Upload source to dolby.io temporary storage.
  const ts = Date.now();
  const inputDlb = `dlb://in/aiflex-${ts}.mp4`;
  const outputDlb = `dlb://out/aiflex-${ts}.mp4`;
  await sdk.media.io.uploadFile(token, inputDlb, args.inputPath);

  // 3. Determine mode. When both DOLBY_IO_WEBHOOK_URL and
  // DOLBY_IO_WEBHOOK_SECRET are set, we run ASYNC: submit with a
  // callback_url, persist a DolbyIOJob row, return pending:true. The
  // webhook route downloads the output when the provider reports
  // Succeeded. Without those vars we fall back to the polling mode
  // (current behaviour) — useful for local dev where tunnels are a
  // hassle. Long-form renders (a 30-min film can take ~20 min to
  // transcode) will fail the 15-min poll deadline, so production SHOULD
  // set the webhook env vars.
  const webhookUrl = process.env.DOLBY_IO_WEBHOOK_URL?.trim();
  const webhookSecret = process.env.DOLBY_IO_WEBHOOK_SECRET?.trim();
  const asyncMode = Boolean(webhookUrl && webhookSecret);

  const jobBody: Record<string, unknown> = {
    inputs: [{ source: inputDlb }],
    outputs: [
      {
        destination: outputDlb,
        kind: "mp4",
        audio: [
          {
            codec: "ec3",
            profile: "dd+atmos",
            bitrate_kbps: 768,
            channels: "7.1.4",
          },
        ],
        video: [{ copy: "source" }],
      },
    ],
  };
  if (asyncMode) {
    jobBody.callback_url = webhookUrl;
  }
  const jobContent = JSON.stringify(jobBody);
  const jobId = await sdk.media.transcode.start(token, jobContent);
  if (!jobId) {
    return {
      real: false,
      provider: "dolbyio",
      reason: "dolby.io SDK returned no job id",
    };
  }

  // 4. Async mode: persist the job row and return pending. The compose
  // pipeline will mark the project as pending-atmos; the webhook will
  // finish the flow.
  if (asyncMode && args.projectId && args.ownerId) {
    try {
      const { createDolbyIoJob } = await import("./dolbyio-jobs");
      await createDolbyIoJob({
        jobId,
        projectId: args.projectId,
        ownerId: args.ownerId,
        outputDlb,
      });
    } catch (err) {
      // Row creation is best-effort — if the DB is down we log and
      // continue in pending mode. The worst outcome is a stale Dolby
      // output that our webhook can't correlate; we already have the
      // jobId in the return value for manual reconciliation.
      // eslint-disable-next-line no-console
      console.error("[atmos-providers] failed to persist DolbyIOJob", err);
    }
    return {
      real: true,
      provider: "dolbyio",
      pending: true,
      jobId,
    };
  }

  // 5. Polling fallback — same 15-minute deadline + 5s cadence as the
  // fetch path. Only safe for short renders (~10 min of output).
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await sdk.media.transcode.getResults(token, jobId);
    const normalized = (status.status || "").toLowerCase();
    if (normalized === "succeeded" || normalized === "success") {
      // 6. Download output.
      await sdk.media.io.downloadFile(token, outputDlb, args.outputPath);
      return { real: true, provider: "dolbyio", outputPath: args.outputPath };
    }
    if (normalized === "failed") {
      return {
        real: false,
        provider: "dolbyio",
        reason: `SDK job failed: ${status.error?.details ?? status.error?.title ?? "unknown"}`,
      };
    }
  }
  return {
    real: false,
    provider: "dolbyio",
    reason: "SDK job timed out after 15min",
  };
}

async function runDolbyIOJob(
  token: string,
  inputPath: string,
  outputPath: string
): Promise<AtmosTranscodeResult> {
  // PUT /v1/media/input → returns presigned upload URL
  const inputRes = await fetch(`${DOLBY_IO_BASE}/v1/media/input`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: `dlb://in/${Date.now()}.mp4`,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!inputRes.ok) {
    return {
      real: false,
      provider: "dolbyio",
      reason: `input registration failed (${inputRes.status})`,
    };
  }
  const { url: uploadUrl, dlb: inputDlb } = (await inputRes.json()) as {
    url: string;
    dlb: string;
  };
  await assertSafeOutboundUrl(uploadUrl);

  // Upload the source file
  const { createReadStream, statSync } = await import("node:fs");
  const size = statSync(inputPath).size;
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    // @ts-expect-error — Node 18+ undici accepts ReadStream
    body: createReadStream(inputPath),
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
    },
    duplex: "half",
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!uploadRes.ok) {
    return {
      real: false,
      provider: "dolbyio",
      reason: `source upload failed (${uploadRes.status})`,
    };
  }

  // Register output URL
  const outRegRes = await fetch(`${DOLBY_IO_BASE}/v1/media/output`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: `dlb://out/${Date.now()}.mp4`,
    }),
  });
  if (!outRegRes.ok) {
    return {
      real: false,
      provider: "dolbyio",
      reason: `output registration failed (${outRegRes.status})`,
    };
  }
  const { dlb: outputDlb, url: outputDownload } = (await outRegRes.json()) as {
    dlb: string;
    url: string;
  };

  // Submit transcode job with Atmos JOC preset
  const jobRes = await fetch(`${DOLBY_IO_BASE}/v1/media/transcode`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ source: inputDlb }],
      outputs: [
        {
          destination: outputDlb,
          kind: "mp4",
          audio: [
            {
              codec: "ec3", // E-AC-3
              profile: "dd+atmos", // JOC + object metadata
              bitrate_kbps: 768,
              channels: "7.1.4", // 7.1 + 4 height channels = Atmos bed
            },
          ],
          video: [{ copy: "source" }],
        },
      ],
    }),
  });
  if (!jobRes.ok) {
    const text = await jobRes.text();
    return {
      real: false,
      provider: "dolbyio",
      reason: `job submit failed (${jobRes.status}): ${text.slice(0, 200)}`,
    };
  }
  const { job_id: jobId } = (await jobRes.json()) as { job_id: string };

  // Poll until terminal
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
      `${DOLBY_IO_BASE}/v1/media/transcode?job_id=${encodeURIComponent(jobId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!statusRes.ok) continue;
    const status = (await statusRes.json()) as {
      status: string;
      progress?: number;
      error?: { message?: string };
    };
    if (status.status === "Succeeded") {
      // Download the result
      await assertSafeOutboundUrl(outputDownload);
      const dlRes = await fetch(outputDownload, {
        signal: AbortSignal.timeout(10 * 60_000),
      });
      if (!dlRes.ok || !dlRes.body) {
        return {
          real: false,
          provider: "dolbyio",
          reason: `download failed (${dlRes.status})`,
        };
      }
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outputPath, Buffer.from(await dlRes.arrayBuffer()));
      return { real: true, provider: "dolbyio", outputPath };
    }
    if (status.status === "Failed") {
      return {
        real: false,
        provider: "dolbyio",
        reason: `job failed: ${status.error?.message ?? "unknown"}`,
      };
    }
  }
  return {
    real: false,
    provider: "dolbyio",
    reason: "job timed out after 15min",
  };
}

// ---------------------------------------------------------------------------
// Local Dolby Reference Encoder — licensed binary invoked as CLI
// ---------------------------------------------------------------------------

async function transcodeReferenceEncoder(args: {
  inputPath: string;
  outputPath: string;
}): Promise<AtmosTranscodeResult> {
  const bin = process.env.DOLBY_REFERENCE_ENCODER_PATH;
  if (!bin) {
    return {
      real: false,
      provider: "reference",
      reason: "DOLBY_REFERENCE_ENCODER_PATH not set",
    };
  }
  try {
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        bin,
        ["--preset", "atmos-streaming", "--input", args.inputPath, "--output", args.outputPath],
        { stdio: "inherit" }
      );
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
    return { real: true, provider: "reference", outputPath: args.outputPath };
  } catch (err) {
    return {
      real: false,
      provider: "reference",
      reason: err instanceof Error ? err.message : "encoder failed",
    };
  }
}
