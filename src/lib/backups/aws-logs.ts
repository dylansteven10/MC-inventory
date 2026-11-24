import {
  S3Client,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getAWSAccounts } from "@/lib/aws/accounts";
import type { BackupAccountResult } from "./types";
import { getRecentBogotaDates } from "./date-utils";

export type NormalizedLogBackup = {
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
};

const SIGA_LOG_BUCKETS: Record<string, { bucket: string; region: string }> = {
  "siga-cauca": { bucket: "bucket-logs-acertemos", region: "us-east-1" },
  "siga-putumayo": { bucket: "bucket-logs-intired", region: "us-east-1" },
  "siga-boyaca": { bucket: "bucket-logs-jer", region: "us-east-1" },
  "siga-santander": { bucket: "bucket-logs-laperla", region: "us-east-1" },
  "siga-antioquia": { bucket: "bucket-logs-reditos", region: "us-east-1" },
  "siga-tolima": { bucket: "bucket-logs-seapto", region: "us-east-1" },
  "siga-narino": { bucket: "bucket-logs-sirius", region: "us-east-1" },
  "siga-santander2": { bucket: "bucket-logs-suchance", region: "us-east-1" },
};

export const AWS_S3_LOGS_IAM_HINT =
  "La credencial AWS necesita los permisos s3:ListBucket para los buckets de logs " +
  "(recomendado: política administrada AmazonS3ReadOnlyAccess).";

function isAccessError(error: any): boolean {
  const name = error?.name || "";
  const msg = `${error?.message || ""} ${error?.Code || ""}`;
  return (
    name === "AccessDeniedException" ||
    name === "UnauthorizedException" ||
    /not authorized|accessdenied|access denied|forbidden|403/i.test(msg)
  );
}

/**
 * List server folders and their total size under a date prefix in an S3 bucket.
 * Returns a Map<serverName, sizeBytes>.
 */
async function listServerFolders(
  client: S3Client,
  bucket: string,
  datePrefix: string,
): Promise<Map<string, number>> {
  const serverFolders = new Map<string, number>();
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: datePrefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }),
    );

    for (const common of page.CommonPrefixes || []) {
      const folderPrefix = common.Prefix || "";
      const parts = folderPrefix.replace(datePrefix, "").split("/");
      const serverName = parts[0];
      if (!serverName) continue;

      const serverPrefix = `${datePrefix}${serverName}/`;
      let serverSize = 0;
      let objContinuationToken: string | undefined;

      do {
        const objPage = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: serverPrefix,
            ContinuationToken: objContinuationToken,
          }),
        );
        for (const obj of objPage.Contents || []) {
          serverSize += obj.Size || 0;
        }
        objContinuationToken = objPage.NextContinuationToken;
      } while (objContinuationToken);

      serverFolders.set(serverName, serverSize);
    }

    continuationToken = page.NextContinuationToken;
  } while (continuationToken);

  return serverFolders;
}

/**
 * Collect AWS log backups for the last 3 days.
 * This ensures we catch backups that were uploaded after the previous day's collection.
 */
export async function collectAWSLogBackups(): Promise<{
  records: NormalizedLogBackup[];
  accounts: BackupAccountResult[];
}> {
  const accounts = getAWSAccounts();
  const records: NormalizedLogBackup[] = [];
  const results: BackupAccountResult[] = [];

  // Collect for the last 3 days to fill gaps from delayed uploads
  const dates = getRecentBogotaDates(3);

  for (const account of accounts) {
    const base = {
      provider: "AWS" as const,
      accountId: account.id,
      accountName: account.name,
      region: account.region,
    };

    const sigaConfig = SIGA_LOG_BUCKETS[account.name.toLowerCase()];
    if (!sigaConfig) {
      results.push({ ...base, ok: true, vaults: 0, records: 0 });
      continue;
    }

    try {
      const client = new S3Client({
        region: sigaConfig.region,
        credentials: { accessKeyId: account.accessKeyId, secretAccessKey: account.secretAccessKey },
      });

      let accountRecords = 0;

      for (const backupDate of dates) {
        const prefix = `${backupDate}/`;
        const serverFolders = await listServerFolders(client, sigaConfig.bucket, prefix);

        if (serverFolders.size === 0) {
          // No folders found for this date — insert a placeholder so the informe
          // can show "Sin backup" for this account/date. This will be cleaned up
          // if a future run finds actual folders.
          records.push({
            ...base,
            bucketName: sigaConfig.bucket,
            backupDate,
            serverName: "(sin carpetas)",
            folderExists: false,
            sizeBytes: 0,
            status: "NO_BACKUP",
            raw: { prefix, note: "No se encontraron carpetas de servidor para esta fecha" },
          });
          accountRecords++;
        } else {
          for (const [serverName, sizeBytes] of serverFolders) {
            const hasContent = sizeBytes > 0;
            records.push({
              ...base,
              bucketName: sigaConfig.bucket,
              backupDate,
              serverName,
              folderExists: true,
              sizeBytes,
              status: hasContent ? "COMPLETED" : "EMPTY",
              raw: { prefix: `${prefix}${serverName}/`, sizeBytes },
            });
            accountRecords++;
          }
        }
      }

      results.push({ ...base, ok: true, vaults: 0, records: accountRecords });
    } catch (error: any) {
      results.push({
        ...base,
        ok: false,
        vaults: 0,
        records: 0,
        error: error?.message || "Error desconocido consultando S3 logs",
        permissionHint: isAccessError(error) ? AWS_S3_LOGS_IAM_HINT : undefined,
      });
    }
  }

  return { records, accounts: results };
}
