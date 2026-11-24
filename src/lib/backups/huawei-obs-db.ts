import ObsClient from "esdk-obs-nodejs";
import { getHuaweiAccounts } from "@/lib/huawei/accounts";
import type { BackupAccountResult } from "./types";
import { getYesterdayBogotaDate } from "./date-utils";

/**
 * Collects database backup status from Huawei OBS buckets.
 *
 * Currently monitors:
 * - backups-databases/FEMFUTURO/YYYYMMDD/  (FEMFUTURO database backup)
 *
 * If the date folder exists → COMPLETED (with total size)
 * If the date folder doesn't exist → MISSING (backup failed)
 */

export type NormalizedObsDbBackup = {
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

export const HUAWEI_OBS_DB_HINT =
  "La credencial Huawei (AK/SK) necesita permisos de listado sobre el bucket OBS backups-databases " +
  "(recomendado: rol de sistema OBS OperateAccess + OBS BucketListAccess).";

/** OBS database folders to monitor: bucket → folder → DB info */
const OBS_DB_FOLDERS = [
  {
    bucket: "backups-databases",
    folder: "FEMFUTURO",
    dbName: "Femfuturo",
    dbId: "obs-femfuturo",
    engine: "obs-backup",
    accountName: "OBS",
  },
] as const;

export async function collectHuaweiObsDbBackups(): Promise<{
  records: NormalizedObsDbBackup[];
  accounts: BackupAccountResult[];
}> {
  const accounts = getHuaweiAccounts();
  const records: NormalizedObsDbBackup[] = [];
  const results: BackupAccountResult[] = [];
  const yesterday = getYesterdayBogotaDate();

  for (const folderConfig of OBS_DB_FOLDERS) {
    // Use acc_ux credentials for OBS API calls, but display as "OBS"
    const credentialAccount = accounts.find((a) => a.name === "acc_ux");
    const account = credentialAccount;
    if (!account) {
      results.push({
        provider: "HUAWEI CLOUD",
        accountId: "",
        accountName: folderConfig.accountName,
        region: "la-north-2",
        ok: false,
        vaults: 0,
        records: 0,
        error: `Cuenta ${folderConfig.accountName} no encontrada`,
      });
      continue;
    }

    const base = {
      provider: "HUAWEI CLOUD" as const,
      accountId: "", // OBS is a virtual account, not a real Huawei project
      accountName: folderConfig.accountName, // "OBS" for display
      region: account.region,
    };

    try {
      const obsClient = new ObsClient({
        access_key_id: account.ak,
        secret_access_key: account.sk,
        server: `https://obs.${account.region}.myhuaweicloud.com`,
      });

      // Check if the date folder exists: backups-databases/FEMFUTURO/20261025/
      const prefix = `${folderConfig.folder}/${yesterday}/`;

      const listResult = await obsClient.listObjects({
        Bucket: folderConfig.bucket,
        Prefix: prefix,
        Delimiter: "/",
        MaxKeys: 1,
      });

      // If there are objects or common prefixes under the date folder, backup exists
      const contents = listResult?.InterfaceResult?.Contents || [];
      const commonPrefixes = listResult?.InterfaceResult?.CommonPrefixes || [];
      const folderExists = contents.length > 0 || commonPrefixes.length > 0;

      let totalSize = 0;
      let fileCount = 0;

      if (folderExists) {
        // Sum all object sizes under the date folder
        let isTruncated = true;
        let marker: string | undefined;
        while (isTruncated) {
          const objResult = await obsClient.listObjects({
            Bucket: folderConfig.bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            Marker: marker || "",
          });
          const objs = objResult?.InterfaceResult?.Contents || [];
          for (const obj of objs) {
            totalSize += Number(obj.Size) || 0;
            fileCount++;
          }
          isTruncated = objResult?.InterfaceResult?.IsTruncated === "true";
          marker = objResult?.InterfaceResult?.NextMarker;
        }
      }

      // Use the actual backup date (yesterday at midnight Bogotá = 05:00 UTC)
      // so the record falls within the informe's query window
      const backupDateISO = `${yesterday.slice(0,4)}-${yesterday.slice(4,6)}-${yesterday.slice(6,8)}T05:00:00.000Z`;
      // For MISSING status, use a deterministic snapshot_id so dedup works
      // (empty string creates orphan records that never match the informe window)
      const missingSnapshotId = `${folderConfig.folder}-MISSING-${yesterday}`;
      records.push({
        ...base,
        dbInstanceId: folderConfig.dbId,
        dbInstanceName: folderConfig.dbName,
        engine: folderConfig.engine,
        snapshotId: folderExists ? `${folderConfig.folder}-${yesterday}` : missingSnapshotId,
        snapshotName: folderExists ? `${folderConfig.folder}/${yesterday}` : "",
        snapshotType: "automated",
        status: folderExists ? "COMPLETED" : "MISSING",
        sizeBytes: folderExists ? totalSize : null,
        snapshotCreatedAt: folderExists ? backupDateISO : null,
        snapshotCompletedAt: folderExists ? backupDateISO : null,
        raw: {
          bucket: folderConfig.bucket,
          prefix,
          folderExists,
          fileCount: folderExists ? fileCount : 0,
          source: "obs",
        },
      });

      results.push({ ...base, ok: true, vaults: 0, records: 1 });
    } catch (error: any) {
      const msg = error?.message || "Error desconocido consultando OBS DB backups";
      const access = /401|403|denied|forbidden|unauthorized|AccessDenied/i.test(msg);
      results.push({
        ...base,
        ok: false,
        vaults: 0,
        records: 0,
        error: msg,
        permissionHint: access ? HUAWEI_OBS_DB_HINT : undefined,
      });
    }
  }

  return { records, accounts: results };
}
