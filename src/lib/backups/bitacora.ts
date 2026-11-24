import { queryAudit } from "@/lib/db/pool";
import { getExceptionPatterns, isServerExcluded } from "@/lib/email/exceptions";
import { readInventoryCache } from "@/lib/inventory/cache";

// ── Types ──

export type BitacoraRecord = {
  id: string;
  provider: string;
  accountId: string;
  accountName: string;
  service: string;
  instanceName: string;
  resourceId: string;
  engine: string;
  backupDate: string;
  backupType: string;
  status: string;
  sizeBytes: number;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type BitacoraFilters = {
  provider?: string;
  accountId?: string;
  service?: string;
  instanceName?: string;
  backupType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export type BitacoraSummary = {
  total: number;
  completed: number;
  completedInstances: number;
  noBackup: number;
  empty: number;
  other: number;
  byProvider: Record<string, number>;
  byType: Record<string, number>;
  dateRange: { min: string | null; max: string | null };
};

// ── Mapping ──

function toRecord(row: any): BitacoraRecord {
  return {
    id: row.id,
    provider: row.provider,
    accountId: row.account_id,
    accountName: row.account_name,
    service: row.service,
    instanceName: row.instance_name,
    resourceId: row.resource_id || "",
    engine: row.engine || "",
    backupDate: row.backup_date,
    backupType: row.backup_type,
    status: row.status,
    sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : 0,
    details: row.details || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

// ── Populate from backup tables ──

/**
 * Populate the bitácora from the three backup tables.
 * Uses INSERT...ON CONFLICT to upsert.
 * Returns the number of rows upserted.
 */
export async function populateBitacora(): Promise<{
  serverRows: number;
  rdsRows: number;
  logRows: number;
  gapRows: number;
}> {
  // Get exception patterns to exclude volatile/temporary servers
  let exceptionClauses = "";
  try {
    const patterns = await getExceptionPatterns();
    if (patterns.size > 0) {
      for (const pat of patterns) {
        exceptionClauses += `\n        AND COALESCE(NULLIF(resource_name, ''), resource_id) NOT LIKE '%${pat.replace(/'/g, "''")}%'`;
      }
    }
  } catch { /* ignore if exceptions table doesn't exist */ }

  // 1. From server_backups — deduplicate by picking the most recent backup per instance/date
  const serverRes = await queryAudit(`
    INSERT INTO backup_bitacora (provider, account_id, account_name, service, instance_name, resource_id, engine, backup_date, backup_type, status, size_bytes, details, updated_at)
    SELECT provider, account_id, account_name, service, instance_name, resource_id, engine, backup_date, backup_type, status, size_bytes, details, now()
    FROM (
      SELECT
        provider, account_id, account_name,
        CASE WHEN provider = 'HUAWEI CLOUD' AND resource_type = 'OS::Nova::Server' THEN 'ECS' ELSE COALESCE(resource_type, 'EC2') END AS service,
        COALESCE(NULLIF(resource_name, ''), resource_id) AS instance_name,
        resource_id AS resource_id,
        '' AS engine,
        TO_CHAR(backup_created_at AT TIME ZONE 'UTC', 'YYYYMMDD') AS backup_date,
        'server' AS backup_type,
        CASE
          WHEN status = 'COMPLETED' THEN 'COMPLETED'
          WHEN status = 'PARTIAL' THEN 'PARTIAL'
          WHEN status = 'EXPIRED' THEN 'EXPIRED'
          WHEN status = 'OTHER' THEN 'OTHER'
          ELSE 'OTHER'
        END AS status,
        COALESCE(size_bytes, 0) AS size_bytes,
        jsonb_build_object('backupId', backup_id, 'vaultName', vault_name, 'region', region) AS details,
        ROW_NUMBER() OVER (
          PARTITION BY provider, account_id, resource_id, TO_CHAR(backup_created_at AT TIME ZONE 'UTC', 'YYYYMMDD')
          ORDER BY backup_completed_at DESC NULLS LAST, backup_created_at DESC
        ) AS rn
      FROM server_backups
      WHERE backup_created_at IS NOT NULL
        AND COALESCE(resource_name, resource_id) != ''
        -- Only real servers: EC2 (AWS) and ECS (Huawei). Exclude AWS ECS (Elastic Container), OS::Cinder::Volume, etc.
        AND (
          (provider = 'AWS' AND COALESCE(resource_type, 'EC2') = 'EC2')
          OR (provider = 'HUAWEI CLOUD' AND COALESCE(resource_type, 'ECS') IN ('ECS', 'OS::Nova::Server'))
        )
        ${exceptionClauses}
    ) sub
    WHERE rn = 1
    ON CONFLICT (provider, account_id, resource_id, backup_date, backup_type) DO UPDATE SET
      account_name = EXCLUDED.account_name,
      service = EXCLUDED.service,
      instance_name = EXCLUDED.instance_name,
      status = EXCLUDED.status,
      size_bytes = EXCLUDED.size_bytes,
      details = EXCLUDED.details,
      updated_at = now()
  `);

  // 2. From rds_backups — deduplicate by picking the most recent snapshot per instance/date
  const rdsRes = await queryAudit(`
    INSERT INTO backup_bitacora (provider, account_id, account_name, service, instance_name, resource_id, engine, backup_date, backup_type, status, size_bytes, details, updated_at)
    SELECT provider, account_id, account_name, service, instance_name, resource_id, engine, backup_date, backup_type, status, size_bytes, details, now()
    FROM (
      SELECT
        provider, account_id, account_name,
        CASE
          WHEN engine ILIKE 'docdb%' OR engine ILIKE 'DocumentDB%' THEN 'DocumentDB'
          WHEN engine ILIKE 'mongodb%' OR engine ILIKE 'DDS%' THEN 'DDS'
          ELSE 'RDS'
        END AS service,
        COALESCE(NULLIF(db_instance_name, ''), db_instance_id) AS instance_name,
        db_instance_id AS resource_id,
        COALESCE(NULLIF(engine, ''), '') AS engine,
        TO_CHAR(snapshot_created_at AT TIME ZONE 'UTC', 'YYYYMMDD') AS backup_date,
        'rds' AS backup_type,
        CASE
          WHEN status = 'available' THEN 'COMPLETED'
          WHEN status = 'creating' THEN 'PARTIAL'
          WHEN status = 'deleted' THEN 'DELETED'
          WHEN snapshot_id IS NOT NULL AND snapshot_id != '' THEN 'COMPLETED'
          WHEN status = 'COMPLETED' THEN 'COMPLETED'
          ELSE 'NO_BACKUP'
        END AS status,
        COALESCE(size_bytes, 0) AS size_bytes,
        jsonb_build_object('snapshotId', snapshot_id, 'snapshotType', snapshot_type, 'region', region) AS details,
        ROW_NUMBER() OVER (
          PARTITION BY provider, account_id, db_instance_id, TO_CHAR(snapshot_created_at AT TIME ZONE 'UTC', 'YYYYMMDD')
          ORDER BY snapshot_completed_at DESC NULLS LAST, snapshot_created_at DESC
        ) AS rn
      FROM rds_backups
      WHERE snapshot_created_at IS NOT NULL
        AND COALESCE(db_instance_name, db_instance_id) != ''
    ) sub
    WHERE rn = 1
    ON CONFLICT (provider, account_id, resource_id, backup_date, backup_type) DO UPDATE SET
      account_name = EXCLUDED.account_name,
      service = EXCLUDED.service,
      instance_name = EXCLUDED.instance_name,
      engine = EXCLUDED.engine,
      status = EXCLUDED.status,
      size_bytes = EXCLUDED.size_bytes,
      details = EXCLUDED.details,
      updated_at = now()
  `);

  // 3. From log_backups — deduplicate (skip "(sin carpetas)" placeholder rows)
  //    Logs are already unique by (provider, account_id, bucket_name, backup_date, server_name)
  //    but we need to ensure uniqueness by (provider, account_id, instance_name, backup_date)
  const logRes = await queryAudit(`
    INSERT INTO backup_bitacora (provider, account_id, account_name, service, instance_name, resource_id, engine, backup_date, backup_type, status, size_bytes, details, updated_at)
    SELECT provider, account_id, account_name, service, instance_name, resource_id, engine, backup_date, backup_type, status, size_bytes, details, now()
    FROM (
      SELECT
        provider, account_id, account_name,
        'Log' AS service,
        server_name AS instance_name,
        server_name AS resource_id,
        '' AS engine,
        backup_date,
        'log' AS backup_type,
        CASE
          WHEN status = 'COMPLETED' THEN 'COMPLETED'
          WHEN status = 'EMPTY' THEN 'EMPTY'
          WHEN status = 'NO_BACKUP' THEN 'NO_BACKUP'
          ELSE 'OTHER'
        END AS status,
        COALESCE(size_bytes, 0) AS size_bytes,
        jsonb_build_object('bucketName', bucket_name, 'region', region) AS details,
        ROW_NUMBER() OVER (
          PARTITION BY provider, account_id, server_name, backup_date
          ORDER BY size_bytes DESC
        ) AS rn
      FROM log_backups
      WHERE server_name != '(sin carpetas)'
    ) sub
    WHERE rn = 1
    ON CONFLICT (provider, account_id, resource_id, backup_date, backup_type) DO UPDATE SET
      account_name = EXCLUDED.account_name,
      service = EXCLUDED.service,
      instance_name = EXCLUDED.instance_name,
      status = EXCLUDED.status,
      size_bytes = EXCLUDED.size_bytes,
      details = EXCLUDED.details,
      updated_at = now()
  `);

  // 4. Fill gaps: For instances that appear in the bitácora on some dates but not others
  //    within the same month, create NO_BACKUP entries for missing dates.
  //    This is limited to the last 30 days to avoid excessive computation.
  const gapRes = await queryAudit(`
    INSERT INTO backup_bitacora (provider, account_id, account_name, service, instance_name, resource_id, engine, backup_date, backup_type, status, size_bytes, details, updated_at)
    SELECT
      i.provider,
      i.account_id,
      i.account_name,
      i.service,
      i.instance_name,
      i.resource_id,
      i.engine,
      d.dt,
      i.backup_type,
      'NO_BACKUP',
      0,
      jsonb_build_object('note', 'Sin backup en esta fecha'),
      now()
    FROM (
      SELECT DISTINCT provider, account_id, account_name, service, instance_name, resource_id, engine, backup_type
      FROM backup_bitacora
      WHERE backup_date >= TO_CHAR(CURRENT_DATE - INTERVAL '30 days', 'YYYYMMDD')
    ) i
    CROSS JOIN (
      SELECT DISTINCT backup_date AS dt
      FROM backup_bitacora
      WHERE backup_date >= TO_CHAR(CURRENT_DATE - INTERVAL '30 days', 'YYYYMMDD')
    ) d
    WHERE NOT EXISTS (
      SELECT 1 FROM backup_bitacora b
      WHERE b.provider = i.provider
        AND b.account_id = i.account_id
        AND b.resource_id = i.resource_id
        AND b.backup_date = d.dt
        AND b.backup_type = i.backup_type
    )
    ON CONFLICT (provider, account_id, resource_id, backup_date, backup_type) DO UPDATE SET
      instance_name = EXCLUDED.instance_name,
      status = EXCLUDED.status,
      updated_at = now()
  `);

  // 5. Backfill resource_id for existing rows that still have empty resource_id
  //    (only needed after migration 023; safe to run every time as a no-op when already filled)
  await queryAudit(`
    UPDATE backup_bitacora b
    SET resource_id = sub.rid
    FROM (
      SELECT DISTINCT ON (b2.id) b2.id AS bid, sb.resource_id AS rid
      FROM backup_bitacora b2
      JOIN server_backups sb ON COALESCE(NULLIF(sb.resource_name, ''), sb.resource_id) = b2.instance_name
        AND sb.provider = b2.provider AND sb.account_id = b2.account_id
      WHERE b2.backup_type = 'server' AND b2.resource_id = ''
    ) sub
    WHERE b.id = sub.bid
  `);

  await queryAudit(`
    UPDATE backup_bitacora b
    SET resource_id = sub.rid
    FROM (
      SELECT DISTINCT ON (b2.id) b2.id AS bid, rb.db_instance_id AS rid
      FROM backup_bitacora b2
      JOIN rds_backups rb ON COALESCE(NULLIF(rb.db_instance_name, ''), rb.db_instance_id) = b2.instance_name
        AND rb.provider = b2.provider AND rb.account_id = b2.account_id
      WHERE b2.backup_type = 'rds' AND b2.resource_id = ''
    ) sub
    WHERE b.id = sub.bid
  `);

  await queryAudit(`
    UPDATE backup_bitacora SET resource_id = instance_name
    WHERE backup_type = 'log' AND resource_id = ''
  `);

  // 6. Backfill engine for existing RDS rows that still have empty engine
  await queryAudit(`
    UPDATE backup_bitacora b
    SET engine = sub.eng
    FROM (
      SELECT DISTINCT ON (b2.id) b2.id AS bid, rb.engine AS eng
      FROM backup_bitacora b2
      JOIN rds_backups rb ON rb.db_instance_id = b2.resource_id
        AND rb.provider = b2.provider AND rb.account_id = b2.account_id
      WHERE b2.backup_type = 'rds' AND b2.engine = ''
    ) sub
    WHERE b.id = sub.bid
  `);

  // 7. Deduplicate: delete old-name rows where a newer-name row exists for the same resource_id
  //    Keep the row whose instance_name matches the current name in the source table
  await queryAudit(`
    DELETE FROM backup_bitacora b
    WHERE b.backup_type = 'server'
      AND b.resource_id != ''
      AND EXISTS (
        SELECT 1 FROM backup_bitacora b2
        WHERE b2.resource_id = b.resource_id
          AND b2.provider = b.provider
          AND b2.account_id = b.account_id
          AND b2.backup_date = b.backup_date
          AND b2.backup_type = b.backup_type
          AND b2.id != b.id
          AND b2.instance_name != b.instance_name
          AND b2.updated_at > b.updated_at
      )
  `);

  await queryAudit(`
    DELETE FROM backup_bitacora b
    WHERE b.backup_type = 'rds'
      AND b.resource_id != ''
      AND EXISTS (
        SELECT 1 FROM backup_bitacora b2
        WHERE b2.resource_id = b.resource_id
          AND b2.provider = b.provider
          AND b2.account_id = b.account_id
          AND b2.backup_date = b.backup_date
          AND b2.backup_type = b.backup_type
          AND b2.id != b.id
          AND b2.instance_name != b.instance_name
          AND b2.updated_at > b.updated_at
      )
  `);

  return {
    serverRows: serverRes.rowCount || 0,
    rdsRows: rdsRes.rowCount || 0,
    logRows: logRes.rowCount || 0,
    gapRows: gapRes.rowCount || 0,
  };
}

// ── Fill inventory gaps ──

type InventoryInstance = {
  provider: string;
  accountId: string;
  accountName: string;
  service: string;
  instanceName: string;
  resourceId: string;
  engine: string;
  backupType: string;
};

/**
 * Insert NO_BACKUP entries for inventory instances that don't have
 * bitácora records for dates already present in the bitácora.
 * This ensures the "Total instancias" count matches the inventory.
 */
export async function fillBitacoraFromInventory(items: InventoryInstance[]): Promise<number> {
  if (items.length === 0) return 0;

  // Get all dates already in the bitácora (last 30 days), plus ensure yesterday is included
  const dateRes = await queryAudit(
    `SELECT DISTINCT backup_date FROM backup_bitacora
     WHERE backup_date >= TO_CHAR(CURRENT_DATE - INTERVAL '30 days', 'YYYYMMDD')`
  );
  const dates: string[] = dateRes.rows.map((r: any) => r.backup_date).filter(Boolean);
  // Always include yesterday so new inventory instances get at least one entry
  const yesterdayRes = await queryAudit(`SELECT TO_CHAR(CURRENT_DATE - INTERVAL '1 day', 'YYYYMMDD') AS dt`);
  const yesterday = yesterdayRes.rows[0]?.dt;
  if (yesterday && !dates.includes(yesterday)) dates.push(yesterday);
  if (dates.length === 0) return 0;

  // Use a temp table approach to avoid parameter type inference issues
  // Insert inventory instances into a temp table, then INSERT...SELECT from it
  await queryAudit(`CREATE TEMP TABLE IF NOT EXISTS tmp_inv_instances (
    provider VARCHAR(20), account_id VARCHAR(50), account_name VARCHAR(100),
    service VARCHAR(30), instance_name VARCHAR(200), resource_id VARCHAR(200), engine VARCHAR(50), backup_type VARCHAR(20)
  )`);
  await queryAudit(`TRUNCATE tmp_inv_instances`);

  // Deduplicate items by (provider, account_id, resource_id, backup_type)
  const seen = new Set<string>();
  let uniqueItems = items.filter(i => {
    if (!i.provider || !i.accountId || !i.instanceName) return false;
    const rid = i.resourceId || i.instanceName;
    const key = `${i.provider}|${i.accountId}|${rid}|${i.backupType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Exclude servers matching exception patterns
  try {
    const patterns = await getExceptionPatterns();
    if (patterns.size > 0) {
      uniqueItems = uniqueItems.filter(i => {
        const name = i.instanceName.toLowerCase();
        for (const pat of patterns) {
          if (name.includes(pat) || name.startsWith(pat)) return false;
        }
        return true;
      });
    }
  } catch { /* ignore */ }

  // Insert instances in small batches
  const CHUNK = 100;
  let totalInserted = 0;
  for (let start = 0; start < uniqueItems.length; start += CHUNK) {
    const chunk = uniqueItems.slice(start, start + CHUNK);
    if (chunk.length === 0) continue;
    const vals = chunk.map(i =>
      `('${esc(i.provider)}','${esc(i.accountId)}','${esc(i.accountName||"")}','${esc(i.service||"")}','${esc(i.instanceName)}','${esc(i.resourceId||i.instanceName)}','${esc(i.engine||"")}','${esc(i.backupType)}')`
    ).join(",");
    await queryAudit(`INSERT INTO tmp_inv_instances VALUES ${vals}`);
  }

  // Now insert NO_BACKUP entries for all instance × date combos not already in bitácora
  const dateList = dates.map(d => `'${d}'`).join(",");
  const res = await queryAudit(`
    INSERT INTO backup_bitacora (provider, account_id, account_name, service, instance_name, resource_id, engine, backup_date, backup_type, status, size_bytes, details, updated_at)
    SELECT i.provider, i.account_id, i.account_name, i.service, i.instance_name, i.resource_id, i.engine, d.dt, i.backup_type, 'NO_BACKUP', 0,
           '{"note":"Instancia sin backup en esta fecha"}'::jsonb, now()
    FROM tmp_inv_instances i
    CROSS JOIN (SELECT unnest(ARRAY[${dateList}]) AS dt) d
    WHERE NOT EXISTS (
      SELECT 1 FROM backup_bitacora b
      WHERE b.provider = i.provider AND b.account_id = i.account_id
        AND b.resource_id = i.resource_id AND b.backup_date = d.dt AND b.backup_type = i.backup_type
    )
    ON CONFLICT (provider, account_id, resource_id, backup_date, backup_type) DO UPDATE SET
      account_name = EXCLUDED.account_name, service = EXCLUDED.service, instance_name = EXCLUDED.instance_name, updated_at = now()
  `);
  totalInserted = res.rowCount || 0;

  await queryAudit(`TRUNCATE tmp_inv_instances`);
  return totalInserted;
}

/** Escape single quotes for SQL string literals */
function esc(s: string): string {
  return s.replace(/'/g, "''");
}

// ── Query ──

const SORT_COLUMNS: Record<string, string> = {
  provider: "provider",
  accountName: "account_name",
  service: "service",
  instanceName: "instance_name",
  engine: "engine",
  backupDate: "backup_date",
  backupType: "backup_type",
  status: "status",
  sizeBytes: "size_bytes",
};

export async function listBitacora(filters: BitacoraFilters = {}): Promise<{
  records: BitacoraRecord[];
  total: number;
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const push = (sql: string, val: unknown) => {
    conditions.push(sql);
    values.push(val);
    return idx++;
  };

  if (filters.provider) push(`provider = $${idx}`, filters.provider);
  if (filters.accountId) push(`account_id = $${idx}`, filters.accountId);
  if (filters.service) push(`service = $${idx}`, filters.service);
  if (filters.backupType) push(`backup_type = $${idx}`, filters.backupType);
  if (filters.status) push(`status = $${idx}`, filters.status);
  if (filters.dateFrom) push(`backup_date >= $${idx}`, filters.dateFrom);
  if (filters.dateTo) push(`backup_date <= $${idx}`, filters.dateTo);
  if (filters.instanceName) push(`instance_name ILIKE $${idx}`, `%${filters.instanceName}%`);
  if (filters.search) {
    conditions.push(`(instance_name ILIKE $${idx} OR account_name ILIKE $${idx} OR service ILIKE $${idx})`);
    values.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortCol = SORT_COLUMNS[filters.sortBy || "backupDate"] || "backup_date";
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize || 50));
  const offset = (page - 1) * pageSize;

  const countRes = await queryAudit(`SELECT count(*) as total FROM backup_bitacora ${where}`, values);
  const total = Number(countRes.rows[0]?.total || 0);

  const dataRes = await queryAudit(
    `SELECT * FROM backup_bitacora ${where} ORDER BY ${sortCol} ${sortDir}, account_name ASC, instance_name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, pageSize, offset],
  );

  return { records: dataRes.rows.map(toRecord), total };
}

// ── Summary ──

export async function getBitacoraSummary(): Promise<BitacoraSummary> {
  const res = await queryAudit(`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE status = 'COMPLETED') as completed,
      count(DISTINCT (provider || '|' || account_id || '|' || COALESCE(NULLIF(resource_id, ''), instance_name))) FILTER (WHERE status = 'COMPLETED') as completed_instances,
      count(*) FILTER (WHERE status = 'NO_BACKUP') as no_backup,
      count(*) FILTER (WHERE status = 'EMPTY') as empty,
      count(*) FILTER (WHERE status NOT IN ('COMPLETED', 'NO_BACKUP', 'EMPTY')) as other,
      min(backup_date) as min_date,
      max(backup_date) as max_date
    FROM backup_bitacora
  `);
  const row = res.rows[0] || {};

  const provRes = await queryAudit(`SELECT provider, count(*) as c FROM backup_bitacora GROUP BY provider`);
  const typeRes = await queryAudit(`SELECT backup_type, count(*) as c FROM backup_bitacora GROUP BY backup_type`);

  return {
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    completedInstances: Number(row.completed_instances || 0),
    noBackup: Number(row.no_backup || 0),
    empty: Number(row.empty || 0),
    other: Number(row.other || 0),
    byProvider: Object.fromEntries(provRes.rows.map((r: any) => [r.provider, Number(r.c)])),
    byType: Object.fromEntries(typeRes.rows.map((r: any) => [r.backup_type, Number(r.c)])),
    dateRange: { min: row.min_date || null, max: row.max_date || null },
  };
}

// ── Filter options ──

export async function getBitacoraFilterOptions(): Promise<{
  providers: string[];
  accounts: { id: string; name: string; provider: string }[];
  services: { name: string; provider: string }[];
  types: string[];
  statuses: string[];
}> {
  const [provRes, accRes, svcRes, typeRes, statRes] = await Promise.all([
    queryAudit(`SELECT DISTINCT provider FROM backup_bitacora ORDER BY provider`),
    queryAudit(`SELECT DISTINCT provider, account_id, account_name FROM backup_bitacora ORDER BY provider, account_name`),
    queryAudit(`SELECT DISTINCT provider, service FROM backup_bitacora ORDER BY provider, service`),
    queryAudit(`SELECT DISTINCT backup_type FROM backup_bitacora ORDER BY backup_type`),
    queryAudit(`SELECT DISTINCT status FROM backup_bitacora ORDER BY status`),
  ]);

  return {
    providers: provRes.rows.map((r: any) => r.provider),
    accounts: accRes.rows.map((r: any) => ({ id: r.account_id, name: r.account_name, provider: r.provider })),
    services: svcRes.rows.map((r: any) => ({ name: r.service, provider: r.provider })),
    types: typeRes.rows.map((r: any) => r.backup_type),
    statuses: statRes.rows.map((r: any) => r.status),
  };
}

// ── Export query (no pagination) ──

export async function getBitacoraForExport(filters: Omit<BitacoraFilters, "page" | "pageSize">): Promise<BitacoraRecord[]> {
  const { records } = await listBitacora({ ...filters, page: 1, pageSize: 10000 });
  return records;
}

// ── Stats for a specific backup type + filters ──
export type BitacoraTypeStats = {
  totalAllServers: number;
  excludedServers: number;
  totalInstances: number;
  totalRecords: number;
  completed: number;
  completedInstances: number;
  failed: number;
  noBackup: number;
  effectiveness: number;
};

export async function getBitacoraTypeStats(filters: Omit<BitacoraFilters, "page" | "pageSize" | "sortBy" | "sortDir">): Promise<BitacoraTypeStats> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const push = (sql: string, val: unknown) => { conditions.push(sql); values.push(val); return idx++; };

  if (filters.provider) push(`provider = $${idx}`, filters.provider);
  if (filters.accountId) push(`account_id = $${idx}`, filters.accountId);
  if (filters.service) push(`service = $${idx}`, filters.service);
  if (filters.backupType) push(`backup_type = $${idx}`, filters.backupType);
  if (filters.status) push(`status = $${idx}`, filters.status);
  if (filters.dateFrom) push(`backup_date >= $${idx}`, filters.dateFrom);
  if (filters.dateTo) push(`backup_date <= $${idx}`, filters.dateTo);
  if (filters.search) {
    conditions.push(`(instance_name ILIKE $${idx} OR account_name ILIKE $${idx})`);
    values.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const res = await queryAudit(`
    SELECT
      count(*) as total_records,
      count(DISTINCT (provider || '|' || account_id || '|' || COALESCE(NULLIF(resource_id, ''), instance_name))) as total_instances,
      count(*) FILTER (WHERE status = 'COMPLETED') as completed,
      count(DISTINCT (provider || '|' || account_id || '|' || COALESCE(NULLIF(resource_id, ''), instance_name))) FILTER (WHERE status = 'COMPLETED') as completed_instances,
      count(DISTINCT (provider || '|' || account_id || '|' || COALESCE(NULLIF(resource_id, ''), instance_name))) FILTER (WHERE status = 'COMPLETED') as completed_instances,
      count(*) FILTER (WHERE status IN ('PARTIAL', 'EXPIRED', 'OTHER')) as failed,
      count(*) FILTER (WHERE status = 'NO_BACKUP') as no_backup
    FROM backup_bitacora
    ${where}
  `, values);

  const row = res.rows[0] || {};
  const totalRecords = Number(row.total_records || 0);
  const completed = Number(row.completed || 0);
  const completedInstances = Number(row.completed_instances || 0);
  const failed = Number(row.failed || 0);
  const noBackup = Number(row.no_backup || 0);
  const totalInstances = Number(row.total_instances || 0);

  let totalAllServers = totalInstances;
  let excludedServers = 0;

  if (filters.backupType === "server" || !filters.backupType) {
    try {
      const cache = readInventoryCache();
      if (cache) {
        const items = cache.data || cache;
        const servers = Array.isArray(items) ? items.filter((i: any) =>
          (i.provider === "AWS" && i.resourceType === "EC2") ||
          (i.provider === "HUAWEI CLOUD" && (i.resourceType === "COMPUTE_INSTANCE" || i.resourceType === "ECS"))
        ) : [];
        totalAllServers = servers.length;
        const patterns = await getExceptionPatterns();
        excludedServers = servers.filter((s: any) => {
          const name = (s.name || s.id || "").trim().toLowerCase();
          for (const pat of patterns) {
            if (name.includes(pat) || name.startsWith(pat)) return true;
          }
          return false;
        }).length;
      }
    } catch { /* ignore */ }
  } else if (filters.backupType === "rds") {
    try {
      const cache = readInventoryCache();
      if (cache) {
        const items = cache.data || cache;
        const dbs = Array.isArray(items) ? items.filter((i: any) =>
          i.resourceType === "RDS" || i.resourceType === "DocumentDB" || i.resourceType === "DATABASE"
        ) : [];
        totalAllServers = dbs.length;
        excludedServers = 0;
      }
    } catch { /* ignore */ }
  }

  const inPlan = totalAllServers - excludedServers;
  const effectiveness = inPlan > 0 ? Math.min((completedInstances / inPlan) * 100, 100) : 0;

  return {
    totalAllServers,
    excludedServers,
    totalInstances: inPlan,
    totalRecords,
    completed,
    completedInstances,
    failed,
    noBackup,
    effectiveness,
  };
}
