import { huaweiRequest } from "@/lib/huawei/auth";
import { getHuaweiAccounts } from "@/lib/huawei/accounts";
import type { BackupAccountResult } from "./types";

export type NormalizedHuaweiDdsBackup = {
  provider: "HUAWEI CLOUD";
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
};

export const HUAWEI_DDS_IAM_HINT =
  "La credencial Huawei (AK/SK) necesita permisos de consulta sobre DDS en este proyecto " +
  "(recomendado: rol de sistema DDS Administrator).";

function normalizeStatus(status: string): string {
  const s = (status || "").toLowerCase();
  if (["available", "completed", "success"].includes(s)) return "COMPLETED";
  if (["creating", "building", "restoring"].includes(s)) return "IN_PROGRESS";
  if (["failed", "error", "abnormal"].includes(s)) return "FAILED";
  if (["deleting"].includes(s)) return "DELETING";
  return (status || "UNKNOWN").toUpperCase();
}

function parseDate(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Collect Huawei DDS (Document Database Service / MongoDB) backups.
 * Uses the DDS API (dds.{region}.myhuaweicloud.com) which is separate from RDS.
 *
 * The backup records use the same schema as RDS backups so they can be
 * stored in the same rds_backups table and matched by the informe.
 */
export async function collectHuaweiDdsBackups(): Promise<{
  records: NormalizedHuaweiDdsBackup[];
  accounts: BackupAccountResult[];
}> {
  const accounts = getHuaweiAccounts();
  const records: NormalizedHuaweiDdsBackup[] = [];
  const results: BackupAccountResult[] = [];

  // Cuentas excluidas (no tienen DDS)
  const EXCLUDED_ACCOUNTS = new Set(["master-lz-ux"]);

  for (const account of accounts) {
    const base = {
      provider: "HUAWEI CLOUD" as const,
      accountId: account.projectId,
      accountName: account.name,
      region: account.region,
    };

    if (EXCLUDED_ACCOUNTS.has(account.name)) {
      results.push({ ...base, ok: true, vaults: 0, records: 0 });
      continue;
    }

    const host = `dds.${account.region}.myhuaweicloud.com`;
    try {
      let accountRecords = 0;

      // ── Paso 1: Listar todas las instancias DDS de la cuenta ──
      const instances: { id: string; name: string }[] = [];
      let instOffset = 0;
      let instTotal = Number.MAX_SAFE_INTEGER;
      while (instOffset < instTotal) {
        const instRes = await huaweiRequest({
          method: "GET",
          host,
          uri: `/v3/${account.projectId}/instances`,
          ak: account.ak,
          sk: account.sk,
          projectId: account.projectId,
          query: { limit: 100, offset: instOffset },
        });
        if (instRes.status >= 400 || !instRes.data) {
          break;
        }
        const instList: any[] = instRes.data.instances || [];
        instTotal = typeof instRes.data.total_count === "number"
          ? instRes.data.total_count
          : (instOffset + instList.length);
        for (const inst of instList) {
          instances.push({ id: inst.id, name: inst.name || inst.id });
        }
        if (instList.length === 0) break;
        instOffset += instList.length;
      }

      // ── Paso 2: Para cada instancia DDS, listar sus backups ──
      // La API de Huawei DDS requiere instance_id para retornar backups.
      const limit = 100;
      for (const inst of instances) {
        let offset = 0;
        let total = Number.MAX_SAFE_INTEGER;
        while (offset < total) {
          const res = await huaweiRequest({
            method: "GET",
            host,
            uri: `/v3/${account.projectId}/backups`,
            ak: account.ak,
            sk: account.sk,
            projectId: account.projectId,
            query: { instance_id: inst.id, limit, offset },
          });
          if (res.status >= 400 || !res.data) {
            break;
          }
          const backups: any[] = res.data.backups || [];
          total = typeof res.data.total_count === "number"
            ? res.data.total_count
            : (offset + backups.length);

          for (const b of backups) {
            records.push({
              ...base,
              dbInstanceId: b.instance_id || inst.id,
              dbInstanceName: b.instance_name || inst.name || inst.id,
              engine: b.datastore?.type || "mongodb",
              snapshotId: b.id || "",
              snapshotName: b.name || b.id || "",
              snapshotType: b.type || "automated",
              status: normalizeStatus(b.status),
              // DDS backup size is in KB (same unit as RDS API)
              sizeBytes: b.size !== undefined && b.size !== null ? Number(b.size) * 1024 : null,
              snapshotCreatedAt: parseDate(b.begin_time || b.created_at),
              snapshotCompletedAt: parseDate(b.end_time || b.updated_at),
              raw: {
                datastore_version: b.datastore?.version || null,
                datastore_complete_version: b.datastore?.complete_version || null,
                backup_strategy: b.backup_strategy || null,
              },
            });
            accountRecords++;
          }
          if (backups.length === 0) break;
          offset += backups.length;
        }
      }

      results.push({ ...base, ok: true, vaults: 0, records: accountRecords });
    } catch (error: any) {
      const msg = error?.message || "Error desconocido consultando DDS backups";
      const access = /401|403|denied|forbidden|unauthorized/i.test(msg);
      results.push({
        ...base,
        ok: false,
        vaults: 0,
        records: 0,
        error: msg,
        permissionHint: access ? HUAWEI_DDS_IAM_HINT : undefined,
      });
    }
  }

  return { records, accounts: results };
}
