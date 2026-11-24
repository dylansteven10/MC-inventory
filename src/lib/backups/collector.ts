import pLimit from "p-limit";
import { collectAWSBackups } from "./aws";
import { collectHuaweiBackups } from "./huawei";
import { collectAWSRdsBackups } from "./aws-rds";
import { collectHuaweiRdsBackups } from "./huawei-rds";
import { collectHuaweiDdsBackups } from "./huawei-dds";
import { collectHuaweiObsDbBackups } from "./huawei-obs-db";
import { collectAWSLogBackups } from "./aws-logs";
import { collectHuaweiLogBackups } from "./huawei-logs";
import { createRefreshLog, finishRefreshLog, upsertBackups } from "./repository";
import { upsertRdsBackups, upsertLogBackups, upsertVaultCapacity, cleanupSinCarpetas, enrichDatabaseVersions } from "./repository-extended";
import { queryAudit } from "@/lib/db/pool";
import { populateBitacora, fillBitacoraFromInventory } from "./bitacora";
import { readInventoryCache } from "@/lib/inventory/cache";
import type { BackupRefreshSummary } from "./types";

let running = false;

export async function refreshBackups(
  trigger: "manual" | "scheduled",
  triggeredBy?: string,
): Promise<BackupRefreshSummary> {
  if (running) {
    throw new Error("BACKUP_REFRESH_ALREADY_RUNNING");
  }
  running = true;
  const startedAt = new Date().toISOString();
  const logId = await createRefreshLog(trigger, triggeredBy);
  try {
    const limit = pLimit(2);

    const [aws, huawei, awsRds, huaweiRds, huaweiDds, huaweiObsDb, awsLogs, huaweiLogs] = await Promise.all([
      limit(() => collectAWSBackups()),
      limit(() => collectHuaweiBackups()),
      limit(() => collectAWSRdsBackups()),
      limit(() => collectHuaweiRdsBackups()),
      limit(() => collectHuaweiDdsBackups()),
      limit(() => collectHuaweiObsDbBackups()),
      limit(() => collectAWSLogBackups()),
      limit(() => collectHuaweiLogBackups()),
    ]);

    const accounts = [
      ...aws.accounts,
      ...huawei.accounts,
      ...awsRds.accounts,
      ...huaweiRds.accounts,
      ...huaweiDds.accounts,
      ...huaweiObsDb.accounts,
      ...awsLogs.accounts,
      ...huaweiLogs.accounts,
    ];

    const [serverUpserted, rdsUpserted, logUpserted, vaultUpserted] = await Promise.all([
      upsertBackups([...aws.records, ...huawei.records]),
      upsertRdsBackups([...awsRds.records, ...huaweiRds.records, ...huaweiDds.records, ...huaweiObsDb.records]),
      upsertLogBackups([...awsLogs.records, ...huaweiLogs.records]),
      upsertVaultCapacity(huawei.vaultCapacity),
    ]);

    // Clean up stale "(sin carpetas)" entries where actual server folders exist
    const cleaned = await cleanupSinCarpetas();
    if (cleaned > 0) {
      console.log(`[backups] cleaned ${cleaned} stale "(sin carpetas)" entries`);
    }

    // Clean up stale server backups older than 7 days (retention policy)
    // AWS AMIs and Huawei CBR backups are deleted by cloud retention after 7 days,
    // but orphaned records remain in the DB
    try {
      const staleResult = await queryAudit(
        `DELETE FROM server_backups
         WHERE status IN ('COMPLETED', 'AVAILABLE')
           AND resource_type IN ('EC2', 'OS::Nova::Server')
           AND backup_completed_at < now() - interval '7 days'`,
      );
      const staleCount = staleResult.rowCount ?? 0;
      if (staleCount > 0) {
        console.log(`[backups] cleaned ${staleCount} stale server backups older than 7 days`);
      }
    } catch (e) {
      console.error("[backups] stale cleanup error:", e instanceof Error ? e.message : e);
    }

    // Enrich database version info (non-blocking)
    enrichDatabaseVersions().then((n) => {
      if (n > 0) console.log(`[db-version] enriched ${n} database inventory rows`);
    }).catch((e) => {
      console.error("[db-version] enrichment error:", e instanceof Error ? e.message : e);
    });

    // Populate bitácora from backup tables, then fill inventory gaps (non-blocking)
    populateBitacora().then(async (r) => {
      const total = r.serverRows + r.rdsRows + r.logRows + r.gapRows;
      console.log(`[bitacora] populated: ${r.serverRows} server, ${r.rdsRows} rds, ${r.logRows} log, ${r.gapRows} gaps = ${total} total`);

      // Fill gaps from inventory cache (instances without any backup)
      try {
        const cache = readInventoryCache();
        if (cache?.data) {
          const instances: { provider: string; accountId: string; accountName: string; service: string; instanceName: string; resourceId: string; engine: string; backupType: string }[] = [];
          for (const item of cache.data) {
            // Only EC2 (AWS) and ECS (Huawei) are servers — exclude AWS ECS (Elastic Container Service)
            if (item.service === "EC2" || (item.service === "ECS" && item.provider === "HUAWEI CLOUD")) {
              instances.push({
                provider: item.provider,
                accountId: item.accountId,
                accountName: item.accountName,
                service: item.service,
                instanceName: item.name || item.id,
                resourceId: item.id || item.name || "",
                engine: "",
                backupType: "server",
              });
            }
            if (item.service === "RDS" || item.resourceType === "DATABASE") {
              const eng = item.engine || "";
              const svc = eng.toLowerCase().startsWith("docdb") || eng.toLowerCase().startsWith("documentdb") ? "DocumentDB"
                : eng.toLowerCase().startsWith("mongodb") || eng.toLowerCase().startsWith("dds") ? "DDS"
                : "RDS";
              instances.push({
                provider: item.provider,
                accountId: item.accountId,
                accountName: item.accountName,
                service: svc,
                instanceName: item.name || item.id,
                resourceId: item.id || item.name || "",
                engine: eng,
                backupType: "rds",
              });
            }
          }
          const invRows = await fillBitacoraFromInventory(instances);
          if (invRows > 0) console.log(`[bitacora] inventory gaps filled: ${invRows} rows`);
        }
      } catch (e) {
        console.error("[bitacora] inventory fill error:", e instanceof Error ? e.message : e);
      }
    }).catch((e) => {
      console.error("[bitacora] populate error:", e instanceof Error ? e.message : e);
    });

    const totalUpserted = serverUpserted + rdsUpserted + logUpserted + vaultUpserted;
    const failed = accounts.filter((a) => !a.ok).length;
    const status = failed === 0 ? "success" : totalUpserted > 0 || accounts.some((a) => a.ok) ? "partial" : "error";
    const finishedAt = new Date().toISOString();
    await finishRefreshLog(logId, status, totalUpserted, {
      accounts,
      trigger,
      serverUpserted,
      rdsUpserted,
      logUpserted,
    });
    return { logId, trigger, status, recordsUpserted: totalUpserted, accounts, startedAt, finishedAt };
  } catch (error: any) {
    const finishedAt = new Date().toISOString();
    await finishRefreshLog(logId, "error", 0, { error: error?.message || "Error desconocido", trigger });
    throw error;
  } finally {
    running = false;
  }
}

export function isBackupRefreshRunning(): boolean {
  return running;
}
