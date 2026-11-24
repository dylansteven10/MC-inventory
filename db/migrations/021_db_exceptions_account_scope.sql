-- Migration 021: Add account scope to db_backup_exceptions
--
-- Allows exceptions to be scoped to a specific account,
-- so the same DB name in different accounts can have different exception rules.
-- account_id = NULL means the exception applies to ALL accounts (global).

-- Add account columns
ALTER TABLE db_backup_exceptions ADD COLUMN IF NOT EXISTS account_id VARCHAR(255);
ALTER TABLE db_backup_exceptions ADD COLUMN IF NOT EXISTS account_name VARCHAR(255);

-- Drop old unique constraint on just pattern (if exists)
ALTER TABLE db_backup_exceptions DROP CONSTRAINT IF EXISTS db_backup_exceptions_pattern_unique;

-- Add new unique constraint on (pattern, account_id) - allows same pattern for different accounts
CREATE UNIQUE INDEX IF NOT EXISTS db_backup_exceptions_pattern_account_unique 
  ON db_backup_exceptions (pattern, account_id);

-- Update invictus-stream exceptions to be specific to Developer account
UPDATE db_backup_exceptions SET account_id = '464783675999', account_name = 'Developer' 
WHERE pattern = 'invictus-stream' AND account_id IS NULL;

UPDATE db_backup_exceptions SET account_id = '464783675999', account_name = 'Developer' 
WHERE pattern = 'invictus-stream-001' AND account_id IS NULL;
