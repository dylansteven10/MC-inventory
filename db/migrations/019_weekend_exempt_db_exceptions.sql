-- Migration 019: Weekend-exempt flag for database backup exceptions
--
-- Some databases are shut down on weekends (Saturday/Sunday) and don't need
-- backup on those days. This flag marks them so the informe/bitácora
-- doesn't count them as "missing" on weekends.

ALTER TABLE db_backup_exceptions
  ADD COLUMN IF NOT EXISTS weekend_exempt BOOLEAN NOT NULL DEFAULT false;

-- Seed weekend-exempt patterns for databases that are off on weekends
INSERT INTO db_backup_exceptions (pattern, reason, weekend_exempt) VALUES
  ('BAOJUN', 'Base de datos apagada fines de semana (OBS backup)', true)
ON CONFLICT (pattern) DO UPDATE SET
  weekend_exempt = EXCLUDED.weekend_exempt;
