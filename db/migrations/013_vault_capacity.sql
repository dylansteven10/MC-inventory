-- Vault capacity tracking for Huawei CBR (and future AWS Backup vaults)
CREATE TABLE IF NOT EXISTS vault_capacity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        VARCHAR(32)  NOT NULL,
  account_id      VARCHAR(255) NOT NULL,
  account_name    VARCHAR(255) NOT NULL,
  region          VARCHAR(64)  NOT NULL,
  vault_id        VARCHAR(255) NOT NULL,
  vault_name      VARCHAR(255) NOT NULL,
  used_bytes      BIGINT       NOT NULL DEFAULT 0,
  capacity_bytes  BIGINT       NOT NULL DEFAULT 0,
  used_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
  collected_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (provider, account_id, vault_id)
);

CREATE INDEX idx_vault_capacity_provider ON vault_capacity (provider);
CREATE INDEX idx_vault_capacity_account  ON vault_capacity (account_id);
