import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createJob, registerHandler, type Job } from "../job-queue";
import { findDolbyIoJobByJobId, updateDolbyIoJobStatus } from "../dolbyio-jobs";
import { prisma } from "../prisma";
import { storagePaths, uploadFromPath } from "../storage";
import { notify } from "../notify";
import { assertSafeOutboundUrl } from "../safe-fetch";

/**
 * Background worker that finishes a Dolby.io async Atmos job after the
 * webhook has fired. Split from the route handler so the webhook ack
 * stays fast (Dolby retries slow POSTs) and the download can retry on
 * transient failures without the provider giving up.
 */

const JOB_TYPE = "atmos-download";

interface AtmosDownloadPayload extends Record<string, unknown> {
  jobId: string;
  projectId: string;
}

export async function enqueueAtmosDownload(payload: AtmosDownloadPayload): Promise<void> {
  // The owner is needed by the generic job-queue contract; we pull it
  // from the Dolby row so the enqueuer doesn't have to know.
  const row = await findDolbyIoJobByJobId(payload.jobId);
  if (!row) return;
  createJob(JOB_TYPE, row.ownerId, payload, 3);
}

async function handleAtmosDownload(
  job: Job,
  updateProgress: (pct: number) => void
): Promise<{ outputUrl: string }> {
  const { jobId, projectId } = job.payload as AtmosDownloadPayload;
  const row = await findDolbyIoJobByJobId(jobId);
  if (!row) throw new Error(`DolbyIOJob ${jobId} disappeared`);
  if (row.status !== "succeeded") {
    throw new Error(`DolbyIOJob ${jobId} status=${row.status}, skipping`);
  }

  updateProgress(5);

  // Two sources for the output file:
  //   1. The presigned URL embedded in the webhook payload (resultUrl) —
  //      valid for ~24h. Preferred when present because it skips the SDK
  //      round-trip. Still goes through assertSafeOutboundUrl since
  //      it's user-attacker-adjacent.
  //   2. The dlb:// key — fall back to the SDK's getDownloadUrl flow
  //      when the presigned URL is absent or has already expired.
  const tmpPath = path.join(os.tmpdir(), `aiflex-atmos-${projectId}-${Date.now()}.mp4`);
  try {
    if (row.resultUrl) {
      await assertSafeOutboundUrl(row.resultUrl);
      const res = await fetch(row.resultUrl, {
        signal: AbortSignal.timeout(10 * 60_000),
      });
      if (!res.ok || !res.body) {
        throw new Error(`download failed (${res.status})`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(tmpPath, buf);
    } else {
      // SDK path — re-auth and download via dlb://.
      const mod = (await import(
        /* @vite-ignore */ "@dolbyio/dolbyio-rest-apis-client"
      )) as unknown as {
        media: {
          authentication: {
            getApiAccessToken: (k: string, s: string, e?: number) => Promise<unknown>;
          };
          io: {
            downloadFile: (t: unknown, d: string, p: string) => Promise<void>;
          };
        };
      };
      const apiKey = process.env.DOLBY_IO_API_KEY;
      const apiSecret = process.env.DOLBY_IO_API_SECRET;
      if (!apiKey || !apiSecret || !row.outputDlb) {
        throw new Error("Cannot re-download: Dolby creds or dlb:// missing");
      }
      const token = await mod.media.authentication.getApiAccessToken(apiKey, apiSecret, 1800);
      await mod.media.io.downloadFile(token, row.outputDlb, tmpPath);
    }
    updateProgress(70);

    // Upload to our own storage using a suffixed key so we don't clobber
    // the existing streaming (.mp4) output. The UI decides which to
    // serve based on project.audioLayoutStatus.
    const key = storagePaths.filmOutput(projectId).replace(/\.mp4$/, "-atmos.mp4");
    const outputUrl = await uploadFromPath(tmpPath, key, "video/mp4");
    updateProgress(95);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        audioLayoutStatus: "ready",
        outputUrl,
      },
    });

    notify({
      userId: row.ownerId,
      kind: "atmos-ready",
      message: "Ton rendu Dolby Atmos est prêt.",
      href: `/studio/${projectId}`,
      projectId,
    }).catch(() => {});

    updateProgress(100);
    return { outputUrl };
  } catch (err) {
    // On unrecoverable download error, mark the job failed so ops can see
    // it. We don't flip the project back to "failed" — the streaming
    // output is still good, only the premium Atmos master is missing.
    await updateDolbyIoJobStatus(jobId, {
      status: "failed",
      errorText: err instanceof Error ? err.message.slice(0, 400) : "download failed",
    });
    throw err;
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

export function registerAtmosDownloadHandler(): void {
  registerHandler(JOB_TYPE, handleAtmosDownload);
}
