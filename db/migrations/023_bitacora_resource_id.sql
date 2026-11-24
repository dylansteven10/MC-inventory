-- 023: Add resource_id and engine columns to backup_bitacora for proper deduplication
-- resource_id: stable identifier (instance ID like i-0xxx, db instance id, or server_name for logs)
-- engine: actual database engine (oracle-se2, mysql, postgres, docdb, etc.)

-- Add columns
ALTER TABLE backup_bitacora ADD COLUMN IF NOT EXISTS resource_id VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE backup_bitacora ADD COLUMN IF NOT EXISTS engine VARCHAR(50) NOT NULL DEFAULT '';

-- Drop the old unique constraint (named by PostgreSQL from the UNIQUE clause in CREATE TABLE)
ALTER TABLE backup_bitacora DROP CONSTRAINT IF EXISTS backup_bitacora_provider_account_id_instance_name_backup_da_key;

-- Create new unique index using resource_id instead of instance_name
CREATE UNIQUE INDEX IF NOT EXISTS backup_bitacora_ukey ON backup_bitacora (provider, account_id, resource_id, backup_date, backup_type);

-- Add index on resource_id for lookups
CREATE INDEX IF NOT EXISTS idx_bitacora_resource_id ON backup_bitacora (resource_id);

-- Add index on engine
CREATE INDEX IF NOT EXISTS idx_bitacora_engine ON backup_bitacora (engine);
