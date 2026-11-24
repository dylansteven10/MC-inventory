-- Database inventory table for the databases informe
CREATE TABLE IF NOT EXISTS database_inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        VARCHAR(32)  NOT NULL,
  account_id      VARCHAR(255) NOT NULL,
  account_name    VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  engine          VARCHAR(64)  NOT NULL DEFAULT '',
  engine_version  VARCHAR(64)  NOT NULL DEFAULT '',
  status          VARCHAR(64)  NOT NULL DEFAULT '',
  host            TEXT         NOT NULL DEFAULT '',
  collected_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (provider, account_id, name)
);

CREATE INDEX idx_db_inventory_provider ON database_inventory (provider);
CREATE INDEX idx_db_inventory_account  ON database_inventory (account_id);
