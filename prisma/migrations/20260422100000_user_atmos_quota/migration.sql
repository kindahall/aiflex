-- User: Dolby Atmos cloud usage + quota override
-- atmosMinutesUsed — counter of cloud-transcoded Atmos minutes consumed
-- in the current `usageMonth`. Resets when usageMonth rolls over (same
-- pattern as usageVideos / usageImages).
-- atmosMinutesQuota — optional per-user override. NULL means "use the
-- plan default" (see lib/plans.ts atmosMinutesPerMonth).
ALTER TABLE "User"
  ADD COLUMN "atmosMinutesUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "atmosMinutesQuota" INTEGER;
