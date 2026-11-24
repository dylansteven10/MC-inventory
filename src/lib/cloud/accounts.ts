import { queryAudit } from "@/lib/db/pool";

export type CloudAccount = {
  id: string;
  provider: "AWS" | "HUAWEI CLOUD";
  name: string;
  accountId: string;
  region: string;
  accessKeyEnc: string | null;
  secretKeyEnc: string | null;
  displayName: string | null;
  environment: string;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function toAccount(row: any): CloudAccount {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    accountId: row.account_id,
    region: row.region,
    accessKeyEnc: row.access_key_enc || null,
    secretKeyEnc: row.secret_key_enc || null,
    displayName: row.display_name || null,
    environment: row.environment || "production",
    active: !!row.active,
    createdBy: row.created_by || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

const COLS = `id, provider, name, account_id, region, access_key_enc, secret_key_enc, display_name, environment, active, created_by, created_at, updated_at`;

/** List all cloud accounts */
export async function listCloudAccounts(provider?: string): Promise<CloudAccount[]> {
  const sql = provider
    ? `SELECT ${COLS} FROM cloud_accounts WHERE provider = $1 ORDER BY provider, name, region`
    : `SELECT ${COLS} FROM cloud_accounts ORDER BY provider, name, region`;
  const res = await queryAudit(sql, provider ? [provider] : []);
  return res.rows.map(toAccount);
}

/** Get all regions for a given account name */
export async function getAccountRegions(provider: string, accountId: string): Promise<string[]> {
  const res = await queryAudit(
    `SELECT DISTINCT region FROM cloud_accounts WHERE provider = $1 AND account_id = $2 AND active = true ORDER BY region`,
    [provider, accountId],
  );
  return res.rows.map((r: any) => r.region);
}

/** Add or update a cloud account entry */
export async function upsertCloudAccount(
  provider: string,
  name: string,
  accountId: string,
  region: string,
  opts?: {
    accessKeyEnc?: string;
    secretKeyEnc?: string;
    displayName?: string;
    environment?: string;
    active?: boolean;
    createdBy?: string;
  },
): Promise<CloudAccount> {
  const res = await queryAudit(
    `INSERT INTO cloud_accounts (provider, name, account_id, region, access_key_enc, secret_key_enc, display_name, environment, active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (provider, account_id, region) DO UPDATE SET
       name = EXCLUDED.name,
       access_key_enc = COALESCE(EXCLUDED.access_key_enc, cloud_accounts.access_key_enc),
       secret_key_enc = COALESCE(EXCLUDED.secret_key_enc, cloud_accounts.secret_key_enc),
       display_name = COALESCE(EXCLUDED.display_name, cloud_accounts.display_name),
       environment = EXCLUDED.environment,
       active = EXCLUDED.active,
       updated_at = now()
     RETURNING ${COLS}`,
    [
      provider, name, accountId, region,
      opts?.accessKeyEnc || null,
      opts?.secretKeyEnc || null,
      opts?.displayName || null,
      opts?.environment || "production",
      opts?.active !== undefined ? opts.active : true,
      opts?.createdBy || null,
    ],
  );
  return toAccount(res.rows[0]);
}

/** Remove a cloud account entry */
export async function removeCloudAccount(id: string): Promise<boolean> {
  const res = await queryAudit(`DELETE FROM cloud_accounts WHERE id = $1`, [id]);
  return (res.rowCount || 0) > 0;
}

/** Deactivate a cloud account (soft delete) */
export async function deactivateCloudAccount(id: string): Promise<boolean> {
  const res = await queryAudit(
    `UPDATE cloud_accounts SET active = false, updated_at = now() WHERE id = $1`,
    [id],
  );
  return (res.rowCount || 0) > 0;
}

/**
 * Sync current env-var-based accounts into the cloud_accounts table.
 * This is a one-time migration helper to populate the DB from existing .env config.
 */
export async function syncEnvAccountsToDb(createdBy?: string): Promise<number> {
  // Dynamic imports to avoid circular deps at module level
  const { getUniqueAWSAccounts } = await import("@/lib/aws/accounts");
  const { getUniqueHuaweiAccounts } = await import("@/lib/huawei/accounts");

  let count = 0;

  // Sync AWS accounts
  const awsAccounts = getUniqueAWSAccounts();
  for (const account of awsAccounts) {
    // For multi-region accounts, get all expanded entries
    const { getAWSAccounts } = await import("@/lib/aws/accounts");
    const expanded = getAWSAccounts().filter((a) => a.id === account.id);
    for (const entry of expanded) {
      await upsertCloudAccount("AWS", entry.name, entry.id, entry.region, {
        accessKeyEnc: "ENC:v1:***", // Don't store raw credentials in DB
        secretKeyEnc: "ENC:v1:***",
        environment: "production",
        active: true,
        createdBy: createdBy || "system-sync",
      });
      count++;
    }
  }

  // Sync Huawei accounts
  const { getHuaweiAccounts: getHwAccounts } = await import("@/lib/huawei/accounts");
  const hwAccounts = getHwAccounts();
  for (const account of hwAccounts) {
    await upsertCloudAccount("HUAWEI CLOUD", account.name, account.projectId, account.region, {
      accessKeyEnc: "ENC:v1:***",
      secretKeyEnc: "ENC:v1:***",
      environment: "production",
      active: true,
      createdBy: createdBy || "system-sync",
    });
    count++;
  }

  return count;
}
