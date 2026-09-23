CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS server_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_column_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id UUID NOT NULL REFERENCES server_columns(id) ON DELETE CASCADE,
  server_id VARCHAR(255) NOT NULL,
  value TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_column_server UNIQUE (column_id, server_id)
);

CREATE INDEX IF NOT EXISTS idx_scv_column_id ON server_column_values(column_id);
CREATE INDEX IF NOT EXISTS idx_scv_server_id ON server_column_values(server_id);
