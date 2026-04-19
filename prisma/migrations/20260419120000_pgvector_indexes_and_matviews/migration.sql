-- Audit P-04 + P-15: pgvector HNSW indexes for similarity search,
-- and materialized views for analytics rollups.
--
-- Apply with `npx prisma migrate deploy` (production) or
-- `npx prisma migrate dev --name pgvector_indexes_and_matviews` (dev).

-- ===========================================================================
-- pgvector indexes (P-04)
-- ===========================================================================
-- Without an HNSW / IVFFLAT index, pgvector falls back to a sequential scan
-- of every embedding row at query time — fine for hundreds of films,
-- catastrophic at thousands. HNSW is faster than IVFFLAT for workloads
-- with frequent inserts (our case) and doesn't require the up-front
-- training pass IVFFLAT does.
--
-- Operator parameters: `m` controls graph fanout (16 is the recommended
-- default; higher = better recall, more RAM). `ef_construction` controls
-- build-time accuracy (64 default).

CREATE INDEX IF NOT EXISTS idx_project_embedding_hnsw
  ON "Project"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_character_facial_embedding_hnsw
  ON "Character"
  USING hnsw ("facialEmbedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ===========================================================================
-- Materialized views for analytics (P-15)
-- ===========================================================================
-- Rolled hourly by the analytics aggregate cron. Reading from the matview
-- is a single index scan instead of an N-row aggregate over FilmView /
-- Project — order-of-magnitude faster for the admin dashboard and the
-- /api/analytics endpoints.

-- Per-day view counts (last 90 days).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_film_views AS
SELECT
  date_trunc('day', "watchedAt") AS day,
  "projectId",
  COUNT(*)                       AS view_count,
  COUNT(DISTINCT "userId")       AS unique_viewers,
  AVG("percentageWatched")       AS avg_pct
FROM "FilmView"
WHERE "watchedAt" >= NOW() - INTERVAL '90 days'
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_film_views
  ON mv_daily_film_views (day, "projectId");

-- Per-creator monthly stats — feeds the "creator dashboard" rollup.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_creator_stats AS
SELECT
  date_trunc('month', fv."watchedAt") AS month,
  p."ownerId"                          AS creator_id,
  COUNT(*)                             AS total_views,
  COUNT(DISTINCT fv."userId")          AS unique_viewers,
  COUNT(DISTINCT fv."projectId")       AS films_with_views,
  AVG(fv."percentageWatched")          AS avg_completion
FROM "FilmView" fv
JOIN "Project" p ON p.id = fv."projectId"
WHERE fv."watchedAt" >= NOW() - INTERVAL '12 months'
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_creator_stats
  ON mv_monthly_creator_stats (month, creator_id);

-- Helper function so the cron can refresh both with one call. Uses the
-- CONCURRENTLY mode so reads aren't blocked during refresh (requires the
-- unique indexes above).
CREATE OR REPLACE FUNCTION refresh_analytics_matviews() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_film_views;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_creator_stats;
END;
$$ LANGUAGE plpgsql;
