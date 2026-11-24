-- Migration 018: Database backup exceptions + per-informe-type recipients
--
-- 1. db_backup_exceptions: databases excluded from backup compliance counts
--    (similar to backup_exceptions for servers, but for databases)
-- 2. Add report_type column to informe_recipients so each informe type
--    (servers, rds, logs, vaults) can have its own recipients

-- ─────────────────────────────────────────────
-- 1. Database backup exceptions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS db_backup_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT '',
  created_by VARCHAR(320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT db_backup_exceptions_pattern_unique UNIQUE (pattern)
);

-- Seed common database exceptions (dev/test DBs that don't need backups)
INSERT INTO db_backup_exceptions (pattern, reason) VALUES
  ('test-', 'Base de datos de prueba/desarrollo'),
  ('_dev', 'Base de datos de desarrollo'),
  ('_qa', 'Base de datos de QA (no producción)'),
  ('_temp', 'Base de datos temporal'),
  ('_staging', 'Base de datos de staging (sin backup requerido)')
ON CONFLICT (pattern) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. Per-informe-type recipients
-- ─────────────────────────────────────────────
-- Add report_type column to informe_recipients
-- NULL = applies to ALL informe types (backward compatible)
-- 'servers' | 'rds' | 'logs' | 'vaults' = specific to that type
ALTER TABLE informe_recipients
  ADD COLUMN IF NOT EXISTS report_type VARCHAR(32);

-- Create index for efficient per-type lookups
CREATE INDEX IF NOT EXISTS idx_informe_recipients_report_type
  ON informe_recipients (report_type) WHERE report_type IS NOT NULL;
