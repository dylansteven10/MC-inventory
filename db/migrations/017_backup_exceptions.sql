-- Backup exceptions: servers excluded from backup counts and reports
-- (volatile/temporary instances like Jenkins slaves that don't need backups)
CREATE TABLE IF NOT EXISTS backup_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT '',
  created_by VARCHAR(320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT backup_exceptions_pattern_unique UNIQUE (pattern)
);

CREATE INDEX IF NOT EXISTS idx_backup_exceptions_pattern ON backup_exceptions (pattern);

-- Seed: known volatile Jenkins/temporary servers
INSERT INTO backup_exceptions (pattern, reason, created_by) VALUES
  ('ux-slave', 'Nodo temporal de Jenkins (creado desde AMI, eliminado después del job)', 'migration:017'),
  ('AWS_JDK_OBSOLETOSv7', 'Servidor temporal/obsoleto, no está en plan de backups', 'migration:017')
ON CONFLICT (pattern) DO NOTHING;
