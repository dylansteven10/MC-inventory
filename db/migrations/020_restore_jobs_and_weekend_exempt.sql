-- Migration 020: Restore jobs table + weekend_exempt column
--
-- restore_jobs: tracks server restoration attempts for backup verification
-- weekend_exempt: already added in 019, this ensures it exists

-- ─────────────────────────────────────────────
-- 1. Restore jobs table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restore_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('AWS', 'HUAWEI CLOUD')),
  account_id VARCHAR(128) NOT NULL,
  account_name VARCHAR(256) NOT NULL DEFAULT '',
  original_resource_id VARCHAR(512) NOT NULL,
  original_resource_name VARCHAR(512) NOT NULL,
  backup_id VARCHAR(512) NOT NULL,
  restored_resource_name VARCHAR(512) NOT NULL,
  restored_resource_id VARCHAR(512),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_restore_jobs_status ON restore_jobs (status);
CREATE INDEX IF NOT EXISTS idx_restore_jobs_provider ON restore_jobs (provider, account_id);
CREATE INDEX IF NOT EXISTS idx_restore_jobs_created ON restore_jobs (created_at DESC);

-- ─────────────────────────────────────────────
-- 2. Ensure weekend_exempt column exists
-- ─────────────────────────────────────────────
ALTER TABLE db_backup_exceptions
  ADD COLUMN IF NOT EXISTS weekend_exempt BOOLEAN NOT NULL DEFAULT false;

-- Seed BAOJUN as weekend-exempt if not already present
INSERT INTO db_backup_exceptions (pattern, reason, weekend_exempt)
VALUES ('BAOJUN', 'Base de datos apagada fines de semana (OBS backup)', true)
ON CONFLICT (pattern) DO UPDATE SET
  weekend_exempt = EXCLUDED.weekend_exempt;
