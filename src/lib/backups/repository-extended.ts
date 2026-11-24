import { queryAudit } from "@/lib/db/pool";

// ── RDS Backups ──

export type RdsBackupRecord = {
  id: string;
  provider: "AWS" | "HUAWEI CLOUD";
  accountId: string;
  accountName: string;
  region: string;
  dbInstanceId: string;
  dbInstanceName: string;
  engine: string;
  snapshotId: string;
  snapshotName: string;
  snapshotType: string;
  status: string;
  sizeBytes: number | null;
  snapshotCreatedAt: string | null;
  snapshotCompletedAt: string | null;
  raw: Record<string, unknown>;
  collectedAt: string;
};

function toRdsRecord(row: any): RdsBackupRecord {
  return {
    id: row.id,
    provider: row.provider,
    accountId: row.account_id,
    accountName: row.account_name,
    region: row.region,
    dbInstanceId: row.db_instance_id,
    dbInstanceName: row.db_instance_name,
    engine: row.engine,
    snapshotId: row.snapshot_id,
    snapshotName: row.snapshot_name,
    snapshotType: row.snapshot_type,
    status: row.status,
    sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : null,
    snapshotCreatedAt: row.snapshot_created_at ? new Date(row.snapshot_created_at).toISOString() : null,
    snapshotCompletedAt: row.snapshot_completed_at ? new Date(row.snapshot_completed_at).toISOString() : null,
    raw: row.raw || {},
    collectedAt: row.collected_at ? new Date(row.collected_at).toISOString() : "",
  };
}

export async function upsertRdsBackups(records: any[]): Promise<number> {
  if (records.length === 0) return 0;
  // Deduplicar por UNIQUE constraint (provider, account_id, snapshot_id)
  const seen = new Map<string, any>();
  for (const r of records) seen.set(`${r.provider}::${r.accountId}::${r.snapshotId}`, r);
  const deduped = [...seen.values()];
  const CHUNK = 500;
  let total = 0;
  for (let start = 0; start < deduped.length; start += CHUNK) {
    const chunk = deduped.slice(start, start + CHUNK);
    const values: unknown[] = [];
    const rows = chunk.map((r, i) => {
      const o = i * 15;
      values.push(
        r.provider, r.accountId, r.accountName, r.region,
        r.dbInstanceId, r.dbInstanceName, r.engine,
        r.snapshotId, r.snapshotName, r.snapshotType, r.status,
        r.sizeBytes, r.snapshotCreatedAt, r.snapshotCompletedAt,
        JSON.stringify(r.raw || {}),
      );
      const ph = Array.from({ length: 15 }, (_, k) => `$${o + k + 1}`).join(", ");
      return `(${ph})`;
    });
    const res = await queryAudit(
      `INSERT INTO rds_backups
        (provider, account_id, account_name, region, db_instance_id, db_instance_name, engine,
         snapshot_id, snapshot_name, snapshot_type, status, size_bytes, snapshot_created_at, snapshot_completed_at, raw)
       VALUES ${rows.join(", ")}
       ON CONFLICT (provider, account_id, snapshot_id) DO UPDATE SET
         account_name = EXCLUDED.account_name,
         region = EXCLUDED.region,
         db_instance_id = EXCLUDED.db_instance_id,
         db_instance_name = EXCLUDED.db_instance_name,
         engine = EXCLUDED.engine,
         snapshot_name = EXCLUDED.snapshot_name,
         snapshot_type = EXCLUDED.snapshot_type,
         status = EXCLUDED.status,
         size_bytes = EXCLUDED.size_bytes,
         snapshot_created_at = EXCLUDED.snapshot_created_at,
         snapshot_completed_at = EXCLUDED.snapshot_completed_at,
         raw = EXCLUDED.raw,
         collected_at = now()`,
      values,
    );
    total += res.rowCount || 0;
  }
  return total;
}

export type RdsBackupFilters = {
  provider?: string;
  accountId?: string;
  status?: string;
  engine?: string;
  snapshotType?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export async function listRdsBackups(filters: RdsBackupFilters): Promise<{ records: RdsBackupRecord[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filters.provider) { conditions.push(`provider = $${i++}`); values.push(filters.provider); }
  if (filters.accountId) { conditions.push(`account_id = $${i++}`); values.push(filters.accountId); }
  if (filters.status) { conditions.push(`status = $${i++}`); values.push(filters.status); }
  if (filters.engine) { conditions.push(`engine = $${i++}`); values.push(filters.engine); }
  if (filters.snapshotType) { conditions.push(`snapshot_type = $${i++}`); values.push(filters.snapshotType); }
  if (filters.from) { conditions.push(`snapshot_created_at >= $${i++}`); values.push(filters.from); }
  if (filters.to) { conditions.push(`snapshot_created_at <= $${i++}`); values.push(filters.to); }
  if (filters.search) {
    conditions.push(`(snapshot_name ILIKE $${i} OR db_instance_name ILIKE $${i} OR snapshot_id ILIKE $${i} OR db_instance_id ILIKE $${i})`);
    values.push(`%${filters.search}%`);
    i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(500, Math.max(1, filters.pageSize || 50));
  const offset = (page - 1) * pageSize;

  const [countRes, rowsRes] = await Promise.all([
    queryAudit(`SELECT COUNT(*)::int AS total FROM rds_backups ${where}`, values),
    queryAudit(
      `SELECT * FROM rds_backups ${where} ORDER BY snapshot_created_at DESC NULLS LAST, collected_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, pageSize, offset],
    ),
  ]);

  return { records: rowsRes.rows.map(toRdsRecord), total: countRes.rows[0]?.total || 0 };
}

export async function getRdsBackupSummary(): Promise<{
  total: number;
  byProvider: Array<{ provider: string; total: number }>;
  byStatus: Array<{ status: string; total: number }>;
  byAccount: Array<{ provider: string; accountId: string; accountName: string; total: number; lastBackup: string | null }>;
  byEngine: Array<{ engine: string; total: number }>;
  totalBytes: number;
}> {
  const [totalRes, providerRes, statusRes, accountRes, engineRes, bytesRes] = await Promise.all([
    queryAudit<{ total: number }>(`SELECT COUNT(*)::int AS total FROM rds_backups`),
    queryAudit<{ provider: string; total: number }>(`SELECT provider, COUNT(*)::int AS total FROM rds_backups GROUP BY provider ORDER BY total DESC`),
    queryAudit<{ status: string; total: number }>(`SELECT status, COUNT(*)::int AS total FROM rds_backups GROUP BY status ORDER BY total DESC`),
    queryAudit<{ provider: string; accountId: string; accountName: string; total: number; lastBackup: Date | string | null }>(`SELECT provider, account_id AS "accountId", account_name AS "accountName", COUNT(*)::int AS total, MAX(snapshot_created_at) AS "lastBackup" FROM rds_backups GROUP BY provider, account_id, account_name ORDER BY total DESC`),
    queryAudit<{ engine: string; total: number }>(`SELECT engine, COUNT(*)::int AS total FROM rds_backups GROUP BY engine ORDER BY total DESC`),
    queryAudit<{ bytes: string }>(`SELECT COALESCE(SUM(size_bytes), 0)::bigint AS bytes FROM rds_backups`),
  ]);
  return {
    total: totalRes.rows[0]?.total || 0,
    byProvider: providerRes.rows,
    byStatus: statusRes.rows,
    byAccount: accountRes.rows.map((r) => ({ ...r, lastBackup: r.lastBackup ? new Date(r.lastBackup).toISOString() : null })),
    byEngine: engineRes.rows,
    totalBytes: Number(bytesRes.rows[0]?.bytes || 0),
  };
}

// ── Log Backups ──

export type LogBackupRecord = {
  id: string;
  provider: "AWS" | "HUAWEI CLOUD";
  accountId: string;
  accountName: string;
  region: string;
  bucketName: string;
  backupDate: string;
  serverName: string;
  folderExists: boolean;
  sizeBytes: number;
  status: string;
  raw: Record<string, unknown>;
  collectedAt: string;
};

function toLogRecord(row: any): LogBackupRecord {
  return {
    id: row.id,
    provider: row.provider,
    accountId: row.account_id,
    accountName: row.account_name,
    region: row.region,
    bucketName: row.bucket_name,
    backupDate: row.backup_date,
    serverName: row.server_name,
    folderExists: row.folder_exists,
    sizeBytes: Number(row.size_bytes || 0),
    status: row.status,
    raw: row.raw || {},
    collectedAt: row.collected_at ? new Date(row.collected_at).toISOString() : "",
  };
}

export async function upsertLogBackups(records: any[]): Promise<number> {
  if (records.length === 0) return 0;
  // Deduplicar por UNIQUE constraint (provider, account_id, bucket_name, backup_date, server_name)
  const seen = new Map<string, any>();
  for (const r of records) seen.set(`${r.provider}::${r.accountId}::${r.bucketName}::${r.backupDate}::${r.serverName}`, r);
  const deduped = [...seen.values()];
  const CHUNK = 500;
  let total = 0;
  for (let start = 0; start < deduped.length; start += CHUNK) {
    const chunk = deduped.slice(start, start + CHUNK);
    const values: unknown[] = [];
    const rows = chunk.map((r: any, i: number) => {
      const o = i * 11;
      values.push(
        r.provider, r.accountId, r.accountName, r.region,
        r.bucketName, r.backupDate, r.serverName,
        r.folderExists, r.sizeBytes, r.status,
        JSON.stringify(r.raw || {}),
      );
      const ph = Array.from({ length: 11 }, (_, k) => `$${o + k + 1}`).join(", ");
      return `(${ph})`;
    });
    const res = await queryAudit(
      `INSERT INTO log_backups
        (provider, account_id, account_name, region, bucket_name, backup_date, server_name, folder_exists, size_bytes, status, raw)
       VALUES ${rows.join(", ")}
       ON CONFLICT (provider, account_id, bucket_name, backup_date, server_name) DO UPDATE SET
         account_name = EXCLUDED.account_name,
         region = EXCLUDED.region,
         folder_exists = EXCLUDED.folder_exists,
         size_bytes = EXCLUDED.size_bytes,
         status = EXCLUDED.status,
         raw = EXCLUDED.raw,
         collected_at = now()`,
      values,
    );
    total += res.rowCount || 0;
  }
  return total;
}

/**
 * Clean up stale "(sin carpetas)" entries where actual server folders exist
 * for the same (provider, account_id, bucket_name, backup_date).
 * Should be called after upsertLogBackups.
 */
export async function cleanupSinCarpetas(): Promise<number> {
  const res = await queryAudit(
    `DELETE FROM log_backups
     WHERE server_name = '(sin carpetas)'
       AND EXISTS (
         SELECT 1 FROM log_backups lb2
         WHERE lb2.provider = log_backups.provider
           AND lb2.account_id = log_backups.account_id
           AND lb2.bucket_name = log_backups.bucket_name
           AND lb2.backup_date = log_backups.backup_date
           AND lb2.server_name != '(sin carpetas)'
       )`,
  );
  return res.rowCount || 0;
}

export type LogBackupFilters = {
  provider?: string;
  accountId?: string;
  status?: string;
  backupDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listLogBackups(filters: LogBackupFilters): Promise<{ records: LogBackupRecord[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filters.provider) { conditions.push(`provider = $${i++}`); values.push(filters.provider); }
  if (filters.accountId) { conditions.push(`account_id = $${i++}`); values.push(filters.accountId); }
  if (filters.status) { conditions.push(`status = $${i++}`); values.push(filters.status); }
  if (filters.backupDate) { conditions.push(`backup_date = $${i++}`); values.push(filters.backupDate); }
  if (filters.search) {
    conditions.push(`(server_name ILIKE $${i} OR bucket_name ILIKE $${i} OR account_name ILIKE $${i})`);
    values.push(`%${filters.search}%`);
    i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(500, Math.max(1, filters.pageSize || 50));
  const offset = (page - 1) * pageSize;

  const [countRes, rowsRes] = await Promise.all([
    queryAudit(`SELECT COUNT(*)::int AS total FROM log_backups ${where}`, values),
    queryAudit(
      `SELECT * FROM log_backups ${where} ORDER BY backup_date DESC, server_name ASC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, pageSize, offset],
    ),
  ]);

  return { records: rowsRes.rows.map(toLogRecord), total: countRes.rows[0]?.total || 0 };
}

export async function getLogBackupSummary(): Promise<{
  total: number;
  byProvider: Array<{ provider: string; total: number }>;
  byStatus: Array<{ status: string; total: number }>;
  byAccount: Array<{ provider: string; accountId: string; accountName: string; total: number }>;
  byDate: Array<{ backupDate: string; total: number }>;
  totalBytes: number;
}> {
  const [totalRes, providerRes, statusRes, accountRes, dateRes, bytesRes] = await Promise.all([
    queryAudit<{ total: number }>(`SELECT COUNT(*)::int AS total FROM log_backups`),
    queryAudit<{ provider: string; total: number }>(`SELECT provider, COUNT(*)::int AS total FROM log_backups GROUP BY provider ORDER BY total DESC`),
    queryAudit<{ status: string; total: number }>(`SELECT status, COUNT(*)::int AS total FROM log_backups GROUP BY status ORDER BY total DESC`),
    queryAudit<{ provider: string; accountId: string; accountName: string; total: number }>(`SELECT provider, account_id AS "accountId", account_name AS "accountName", COUNT(*)::int AS total FROM log_backups GROUP BY provider, account_id, account_name ORDER BY total DESC`),
    queryAudit<{ backupDate: string; total: number }>(`SELECT backup_date AS "backupDate", COUNT(*)::int AS total FROM log_backups GROUP BY backup_date ORDER BY backup_date DESC LIMIT 30`),
    queryAudit<{ bytes: string }>(`SELECT COALESCE(SUM(size_bytes), 0)::bigint AS bytes FROM log_backups`),
  ]);
  return {
    total: totalRes.rows[0]?.total || 0,
    byProvider: providerRes.rows,
    byStatus: statusRes.rows,
    byAccount: accountRes.rows,
    byDate: dateRes.rows,
    totalBytes: Number(bytesRes.rows[0]?.bytes || 0),
  };
}

// ── Vault Capacity ──

export type VaultCapacityRow = {
  provider: string;
  accountId: string;
  accountName: string;
  region: string;
  vaultId: string;
  vaultName: string;
  usedBytes: number;
  capacityBytes: number;
  usedPercent: number;
  collectedAt: string;
};

export async function upsertVaultCapacity(records: any[]): Promise<number> {
  // Marcar timestamp antes del upsert para limpieza de vaults eliminados
  const beforeTs = new Date();

  if (records.length > 0) {
    // Deduplicar por UNIQUE constraint (provider, account_id, vault_id)
    const seen = new Map<string, any>();
    for (const r of records) seen.set(`${r.provider}::${r.accountId}::${r.vaultId}`, r);
    const unique = [...seen.values()];
    const values: unknown[] = [];
    const rows = unique.map((r, i) => {
      const o = i * 8;
      values.push(
        r.provider, r.accountId, r.accountName, r.region,
        r.vaultId, r.vaultName, r.usedBytes, r.capacityBytes,
      );
      const ph = Array.from({ length: 8 }, (_, k) => `$${o + k + 1}`).join(", ");
      return `(${ph})`;
    });
    await queryAudit(
      `INSERT INTO vault_capacity
        (provider, account_id, account_name, region, vault_id, vault_name, used_bytes, capacity_bytes)
       VALUES ${rows.join(", ")}
       ON CONFLICT (provider, account_id, vault_id) DO UPDATE SET
         account_name = EXCLUDED.account_name,
         region = EXCLUDED.region,
         vault_name = EXCLUDED.vault_name,
         used_bytes = EXCLUDED.used_bytes,
         capacity_bytes = EXCLUDED.capacity_bytes,
         used_percent = CASE WHEN EXCLUDED.capacity_bytes > 0 THEN ROUND((EXCLUDED.used_bytes::numeric / EXCLUDED.capacity_bytes) * 10000) / 100 ELSE 0 END,
         collected_at = now()`,
      values,
    );
  }

  // ── Limpiar vaults eliminados: los que no fueron actualizados en este run ──
  // Cualquier vault con collected_at anterior al inicio de este upsert ya no existe en la API
  const delRes = await queryAudit(
    `DELETE FROM vault_capacity WHERE collected_at < $1`,
    [beforeTs.toISOString()],
  );
  if (delRes.rowCount && delRes.rowCount > 0) {
    console.log(`[vault-cleanup] Eliminados ${delRes.rowCount} vaults que ya no existen en la API`);
  }

  return records.length;
}

export async function listVaultCapacity(provider?: string): Promise<VaultCapacityRow[]> {
  const where = provider ? `WHERE provider = $1` : "";
  const res = await queryAudit(
    `SELECT provider, account_id AS "accountId", account_name AS "accountName", region,
            vault_id AS "vaultId", vault_name AS "vaultName",
            used_bytes AS "usedBytes", capacity_bytes AS "capacityBytes",
            used_percent AS "usedPercent",
            collected_at AS "collectedAt"
     FROM vault_capacity ${where}
     ORDER BY provider, account_name, vault_name`,
    provider ? [provider] : [],
  );
  return res.rows as VaultCapacityRow[];
}

// ── Database Inventory ──

export type DatabaseInventoryRecord = {
  provider: string;
  accountId: string;
  accountName: string;
  name: string;
  engine: string;
  engineVersion: string;
  status: string;
  host: string;
};

export async function upsertDatabaseInventory(records: DatabaseInventoryRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  // Deduplicar por UNIQUE constraint (provider, account_id, name) para evitar
  // "ON CONFLICT DO UPDATE command cannot affect row a second time"
  const seen = new Map<string, DatabaseInventoryRecord>();
  for (const r of records) {
    const key = `${r.provider}::${r.accountId}::${r.name}`;
    seen.set(key, r);
  }
  const unique = [...seen.values()];
  const values: unknown[] = [];
  const rows = unique.map((r, i) => {
    const o = i * 8;
    values.push(r.provider, r.accountId, r.accountName, r.name, r.engine, r.engineVersion, r.status, r.host);
    const ph = Array.from({ length: 8 }, (_, k) => `$${o + k + 1}`).join(", ");
    return `(${ph})`;
  });
  const res = await queryAudit(
    `INSERT INTO database_inventory
      (provider, account_id, account_name, name, engine, engine_version, status, host)
     VALUES ${rows.join(", ")}
     ON CONFLICT (provider, account_id, name) DO UPDATE SET
       account_name = EXCLUDED.account_name,
       engine = EXCLUDED.engine,
       engine_version = EXCLUDED.engine_version,
       status = EXCLUDED.status,
       host = EXCLUDED.host,
       collected_at = now()`,
    values,
  );
  return res.rowCount || 0;
}

// ── Version Enrichment (vía API del proveedor) ──

/**
 * Calcula y actualiza latest_patch / update_status / update_observation de
 * database_inventory consultando la API del proveedor:
 *
 * - AWS: describe-db-engine-versions → ValidUpgradeTarget[IsMajorVersionUpgrade==false],
 *   la última entrada es la última versión menor (igual que el script de referencia).
 * - Huawei: GET /v3/{project_id}/datastores/{engine}/small-version → la versión
 *   más alta disponible es la última versión menor.
 *
 * Los errores transitorios de API preservan los valores previos de la fila.
 */
export async function enrichDatabaseVersions(): Promise<number> {
  const { checkAWSVersion, checkHuaweiVersion } = await import("@/lib/db/version-api");
  type VersionCheckResult = import("@/lib/db/version-api").VersionCheckResult;

  const res = await queryAudit<{
    id: string;
    provider: string;
    account_id: string;
    engine: string;
    engine_version: string;
  }>(
    `SELECT id, provider, account_id, engine, engine_version FROM database_inventory WHERE engine_version != ''`,
  );

  if (res.rows.length === 0) return 0;

  // 1. Deduplicar combos (engine, versión) para minimizar llamadas API.
  //    AWS: el catálogo es global por motor. Huawei: por cuenta (región).
  const SEP = "\u0001";
  const awsCombos = new Map<string, { engine: string; version: string }>();
  const huaweiCombos = new Map<string, { accountId: string; engine: string; version: string }>();

  for (const row of res.rows) {
    if (row.provider === "AWS") {
      const key = `${row.engine}${SEP}${row.engine_version}`;
      if (!awsCombos.has(key)) awsCombos.set(key, { engine: row.engine, version: row.engine_version });
    } else if (row.provider === "HUAWEI CLOUD") {
      const key = `${row.account_id}${SEP}${row.engine}${SEP}${row.engine_version}`;
      if (!huaweiCombos.has(key)) huaweiCombos.set(key, { accountId: row.account_id, engine: row.engine, version: row.engine_version });
    }
  }

  // 2. Consultar las APIs en paralelo (los combos ya están deduplicados).
  const awsResults = new Map<string, VersionCheckResult>();
  await Promise.all(
    [...awsCombos.entries()].map(async ([key, combo]) => {
      const result = await checkAWSVersion(combo.engine, combo.version);
      if (result.kind === "error") {
        console.error(`[db-version] AWS ${combo.engine} ${combo.version}: ${result.message}`);
      }
      awsResults.set(key, result);
    }),
  );

  const huaweiResults = new Map<string, VersionCheckResult>();
  await Promise.all(
    [...huaweiCombos.entries()].map(async ([key, combo]) => {
      const result = await checkHuaweiVersion(combo.accountId, combo.engine, combo.version);
      if (result.kind === "error") {
        console.error(`[db-version] HUAWEI ${combo.engine} ${combo.version}: ${result.message}`);
      }
      huaweiResults.set(key, result);
    }),
  );

  // 3. Aplicar resultados. "error" (transitorio) preserva los valores previos.
  const ids: string[] = [];
  const patches: string[] = [];
  const statuses: string[] = [];
  const observations: string[] = [];

  for (const row of res.rows) {
    const result =
      row.provider === "AWS"
        ? awsResults.get(`${row.engine}${SEP}${row.engine_version}`)
        : huaweiResults.get(`${row.account_id}${SEP}${row.engine}${SEP}${row.engine_version}`);
    if (!result || result.kind === "error") continue;

    ids.push(row.id);
    if (result.kind === "ok") {
      patches.push(result.latestPatch);
      statuses.push(result.updateStatus);
    } else {
      // unsupported: sin última versión consultable
      patches.push("");
      statuses.push("Desconocido");
    }
    observations.push(result.observation);
  }

  if (ids.length === 0) return 0;

  const updateRes = await queryAudit(
    `UPDATE database_inventory SET
       latest_patch = v.latest_patch,
       update_status = v.update_status,
       update_observation = v.update_observation
     FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[])
       AS v(id, latest_patch, update_status, update_observation)
     WHERE database_inventory.id = v.id`,
    [ids, patches, statuses, observations],
  );
  return updateRes.rowCount || 0;
}
