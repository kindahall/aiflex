-- Wave 11.7 — Dolby.io async transcode jobs + webhook ingest
--
-- Project.audioLayoutStatus drives the UI badge ("Atmos in progress…" /
-- "Atmos ready"). "pending-atmos" is set by the compose pipeline when it
-- submits an async Dolby.io job; the webhook flips it to "ready" or
-- "failed" once the provider reports a terminal state.
ALTER TABLE "Project"
  ADD COLUMN "audioLayoutStatus" TEXT;

-- DolbyIOJob — correlation row between a compose run and a Dolby.io
-- transcode job. Keyed on jobId (unique in the Dolby account).
CREATE TABLE "DolbyIOJob" (
  "id"        TEXT NOT NULL,
  "jobId"     TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "ownerId"   TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'pending',
  "resultUrl" TEXT,
  "errorText" TEXT,
  "outputDlb" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DolbyIOJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DolbyIOJob_jobId_key" ON "DolbyIOJob"("jobId");
CREATE INDEX "DolbyIOJob_projectId_idx" ON "DolbyIOJob"("projectId");
CREATE INDEX "DolbyIOJob_ownerId_idx" ON "DolbyIOJob"("ownerId");
CREATE INDEX "DolbyIOJob_status_idx" ON "DolbyIOJob"("status");
