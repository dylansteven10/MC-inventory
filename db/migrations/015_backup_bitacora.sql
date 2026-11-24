-- Bitácora de backups: historial consolidado de estado de backups por instancia y fecha
-- Los datos se retienen indefinidamente (la política de retención de 7 días aplica solo en la nube)
CREATE TABLE IF NOT EXISTS backup_bitacora (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        VARCHAR(20)  NOT NULL,
  account_id      VARCHAR(50)  NOT NULL,
  account_name    VARCHAR(100) NOT NULL,
  service         VARCHAR(30)  NOT NULL,
  instance_name   VARCHAR(200) NOT NULL,
  backup_date     VARCHAR(8)   NOT NULL,
  backup_type     VARCHAR(20)  NOT NULL,   -- server | rds | log
  status          VARCHAR(30)  NOT NULL,   -- COMPLETED | NO_BACKUP | EMPTY | PARTIAL | EXPIRED | OTHER
  size_bytes      BIGINT       DEFAULT 0,
  details         JSONB        DEFAULT '{}',
  created_at      TIMESTAMPTZ  DEFAULT now(),
  updated_at      TIMESTAMPTZ  DEFAULT now(),
  UNIQUE (provider, account_id, instance_name, backup_date, backup_type)
);

CREATE INDEX idx_bitacora_provider    ON backup_bitacora (provider);
CREATE INDEX idx_bitacora_account     ON backup_bitacora (account_id, account_name);
CREATE INDEX idx_bitacora_service     ON backup_bitacora (service);
CREATE INDEX idx_bitacora_date        ON backup_bitacora (backup_date);
CREATE INDEX idx_bitacora_status      ON backup_bitacora (status);
CREATE INDEX idx_bitacora_type        ON backup_bitacora (backup_type);
CREATE INDEX idx_bitacora_instance    ON backup_bitacora (instance_name);
