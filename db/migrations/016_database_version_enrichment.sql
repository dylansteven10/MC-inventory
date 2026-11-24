-- Add version enrichment columns to database_inventory
ALTER TABLE database_inventory
  ADD COLUMN IF NOT EXISTS latest_patch        VARCHAR(64)  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS update_status       VARCHAR(32)  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS update_observation  TEXT         NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_db_inventory_update_status ON database_inventory (update_status);
