-- Migration 022: Account regions configuration table
-- Stores cloud account configuration for the web UI.
-- This allows adding/editing accounts and regions from the frontend
-- without needing to modify .env files or docker-compose.yml.

CREATE TABLE IF NOT EXISTS cloud_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('AWS', 'HUAWEI CLOUD')),
  name VARCHAR(255) NOT NULL,
  -- AWS: account ID (12 digits). Huawei: project ID (32 hex chars)
  account_id VARCHAR(255) NOT NULL,
  region VARCHAR(100) NOT NULL,
  -- Encrypted credentials (stored as ENC:v1:... or plain for AK/SK)
  access_key_enc TEXT,
  secret_key_enc TEXT,
  -- Display metadata
  display_name VARCHAR(255),
  environment VARCHAR(50) DEFAULT 'production',
  -- Status
  active BOOLEAN NOT NULL DEFAULT true,
  -- Audit
  created_by VARCHAR(320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Unique constraint: same account_id can appear in multiple regions
  CONSTRAINT cloud_accounts_unique UNIQUE (provider, account_id, region)
);

CREATE INDEX IF NOT EXISTS idx_cloud_accounts_provider ON cloud_accounts (provider);
CREATE INDEX IF NOT EXISTS idx_cloud_accounts_name ON cloud_accounts (name);
CREATE INDEX IF NOT EXISTS idx_cloud_accounts_active ON cloud_accounts (active);

-- Seed current AWS accounts from env (will be populated by a sync script)
-- This table is initially empty and can be populated from the web UI
-- or by running a sync script that reads current env vars.
