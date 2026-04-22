import "server-only";
import { prisma } from "./prisma";

/**
 * DolbyIOJob data access. Separated from lib/atmos-providers.ts so the
 * provider module stays import-safe (no Prisma pulled in at cold start
 * when an Atmos job isn't actually running). The webhook route and the
 * provider's async-submit path share this surface.
 */

export type DolbyIoJobStatus = "pending" | "running" | "succeeded" | "failed";

export interface DolbyIoJobRow {
  id: string;
  jobId: string;
  projectId: string;
  ownerId: string;
  status: DolbyIoJobStatus;
  resultUrl?: string;
  errorText?: string;
  outputDlb?: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function createDolbyIoJob(args: {
  jobId: string;
  projectId: string;
  ownerId: string;
  outputDlb?: string;
}): Promise<void> {
  await prisma.dolbyIOJob.create({
    data: {
      jobId: args.jobId,
      projectId: args.projectId,
      ownerId: args.ownerId,
      status: "pending",
      outputDlb: args.outputDlb,
    },
  });
}

export async function findDolbyIoJobByJobId(jobId: string): Promise<DolbyIoJobRow | null> {
  const row = await prisma.dolbyIOJob.findUnique({ where: { jobId } });
  if (!row) return null;
  return rowToDomain(row);
}

export async function updateDolbyIoJobStatus(
  jobId: string,
  patch: {
    status: DolbyIoJobStatus;
    resultUrl?: string | null;
    errorText?: string | null;
  }
): Promise<DolbyIoJobRow | null> {
  const data: Record<string, unknown> = { status: patch.status };
  if (patch.resultUrl !== undefined) data.resultUrl = patch.resultUrl;
  if (patch.errorText !== undefined) data.errorText = patch.errorText;
  try {
    const row = await prisma.dolbyIOJob.update({
      where: { jobId },
      data,
    });
    return rowToDomain(row);
  } catch {
    // Webhook delivered for a job we never recorded — refuse silently.
    // A replay attacker or a misconfigured account can trigger this.
    return null;
  }
}

function rowToDomain(row: {
  id: string;
  jobId: string;
  projectId: string;
  ownerId: string;
  status: string;
  resultUrl: string | null;
  errorText: string | null;
  outputDlb: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DolbyIoJobRow {
  return {
    id: row.id,
    jobId: row.jobId,
    projectId: row.projectId,
    ownerId: row.ownerId,
    status: row.status as DolbyIoJobStatus,
    resultUrl: row.resultUrl ?? undefined,
    errorText: row.errorText ?? undefined,
    outputDlb: row.outputDlb ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
