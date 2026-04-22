import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { captureError } from "@/lib/observability";
import { findDolbyIoJobByJobId, updateDolbyIoJobStatus } from "@/lib/dolbyio-jobs";
import { enqueueAtmosDownload } from "@/lib/jobs/atmos-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dolby.io Media API webhook endpoint.
 *
 * Flow:
 *   1. Verify HMAC-SHA256 of the raw body against DOLBY_IO_WEBHOOK_SECRET.
 *   2. Parse the status payload (`{ job_id, status, result_url }`).
 *   3. Update the correlated DolbyIOJob row + the project's audioLayoutStatus.
 *   4. When status = Succeeded, enqueue a background worker to download
 *      the output and replace the project's atmos-stub outputUrl with
 *      the real Atmos master.
 *
 * Authentication is signature-only — we do NOT allowlist Dolby's egress
 * IPs here because Dolby.io doesn't publish a stable range, and a forged
 * POST without the secret is rejected by the HMAC check below.
 */

interface DolbyIoWebhookPayload {
  job_id?: string;
  status?: string;
  result_url?: string;
  error?: { message?: string };
}

function verifySignature(raw: string, header: string, secret: string): boolean {
  // Dolby's documented signature format is a bare lowercase hex digest
  // (HMAC-SHA256). Some operators have seen `sha256=<hex>` in the wild,
  // so accept both with a defensive strip.
  const provided = header.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(provided.toLowerCase(), "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

function normalizeStatus(raw: string | undefined): "running" | "succeeded" | "failed" | "pending" {
  const s = (raw || "").toLowerCase();
  if (s === "succeeded" || s === "success") return "succeeded";
  if (s === "failed" || s === "error") return "failed";
  if (s === "pending" || s === "queued") return "pending";
  return "running";
}

export async function POST(req: NextRequest) {
  const secret = process.env.DOLBY_IO_WEBHOOK_SECRET;
  if (!secret) {
    // Fail-closed: if the operator hasn't set the secret, refuse rather
    // than treat all incoming POSTs as unauthenticated.
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const header = req.headers.get("dolby-signature") || "";
  if (!header) {
    return NextResponse.json({ error: "Missing Dolby-Signature header" }, { status: 401 });
  }

  const raw = await req.text();
  if (!verifySignature(raw, header, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: DolbyIoWebhookPayload;
  try {
    payload = JSON.parse(raw) as DolbyIoWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const jobId = payload.job_id;
  if (!jobId) {
    return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
  }

  const status = normalizeStatus(payload.status);
  const existing = await findDolbyIoJobByJobId(jobId);
  if (!existing) {
    // Unknown jobId — either replay, account mismatch, or a race where
    // the DolbyIOJob row didn't persist before the webhook arrived. We
    // return 200 with a no-op so Dolby doesn't retry indefinitely, but
    // flag it for ops visibility.
    captureError(new Error(`Unknown Dolby.io job_id: ${jobId}`), {
      route: "api/webhooks/dolbyio",
    }).catch(() => {});
    return NextResponse.json({ received: true, known: false });
  }

  const errorText =
    status === "failed"
      ? (payload.error?.message || "dolby.io reported failure").slice(0, 400)
      : null;

  await updateDolbyIoJobStatus(jobId, {
    status,
    resultUrl: payload.result_url ?? null,
    errorText,
  });

  if (status === "succeeded") {
    // Hand off to a background worker so we ack the webhook quickly
    // (Dolby.io will retry the POST if we take > a few seconds).
    enqueueAtmosDownload({ jobId, projectId: existing.projectId }).catch((err) =>
      captureError(err, { route: "api/webhooks/dolbyio:enqueue" })
    );
  }

  return NextResponse.json({ received: true, known: true, status });
}
