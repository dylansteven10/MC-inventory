import { resolveSecret } from "@/lib/secrets/crypto";

export type HuaweiAccount = {
  name: string;
  projectId: string;
  ak: string;
  sk: string;
  region: string;
};

/**
 * Get all Huawei Cloud accounts from environment variables.
 *
 * In Huawei Cloud, each region has its own Project ID, so each numbered
 * env var entry represents one project in one region. To add a second
 * region for the same logical account, add another numbered entry with
 * the same name but different PROJECT_ID and REGION.
 *
 * Example:
 *   HUAWEI_ACCOUNT_2_NAME=acc_reditos
 *   HUAWEI_ACCOUNT_2_PROJECT_ID=38874a92...   (la-north-2)
 *   HUAWEI_ACCOUNT_2_REGION=la-north-2
 *
 *   HUAWEI_ACCOUNT_12_NAME=acc_reditos        (same name, different region)
 *   HUAWEI_ACCOUNT_12_PROJECT_ID=207f90ef...  (na-mexico-1)
 *   HUAWEI_ACCOUNT_12_REGION=na-mexico-1
 *   HUAWEI_ACCOUNT_12_AK=<same AK>            (Huawei IAM is global)
 *   HUAWEI_ACCOUNT_12_SK=<same SK>
 */
export function getHuaweiAccounts(): HuaweiAccount[] {
  const accounts: HuaweiAccount[] = [];
  let index = 1;

  while (true) {
    const name = process.env[`HUAWEI_ACCOUNT_${index}_NAME`];
    const projectId = process.env[`HUAWEI_ACCOUNT_${index}_PROJECT_ID`];
    const ak = resolveSecret(process.env[`HUAWEI_ACCOUNT_${index}_AK`]);
    const sk = resolveSecret(process.env[`HUAWEI_ACCOUNT_${index}_SK`]);
    const region = process.env[`HUAWEI_ACCOUNT_${index}_REGION`] || "la-north-2";

    if (!name || !projectId || !ak || !sk) break;

    accounts.push({ name, projectId, ak, sk, region });
    index++;
  }

  return accounts;
}

/**
 * Get unique Huawei accounts (one per projectId).
 * Since each region has a different projectId, this returns one entry
 * per project-region combination.
 */
export function getUniqueHuaweiAccounts(): HuaweiAccount[] {
  const seen = new Set<string>();
  return getHuaweiAccounts().filter((a) => {
    if (seen.has(a.projectId)) return false;
    seen.add(a.projectId);
    return true;
  });
}

/**
 * Get all regions configured for a given account name.
 * Useful for display purposes (e.g., "acc_reditos: la-north-2, na-mexico-1").
 */
export function getHuaweiAccountRegions(accountName: string): string[] {
  const accounts = getHuaweiAccounts().filter((a) => a.name === accountName);
  return [...new Set(accounts.map((a) => a.region))].sort();
}

// ─────────────────────────────────────────────
// Helper map: projectId → name (first match)
// ─────────────────────────────────────────────
export const HUAWEI_ACCOUNT_MAP: Record<string, string> =
  getUniqueHuaweiAccounts().reduce(
    (acc, account) => {
      acc[account.projectId] = account.name;
      return acc;
    },
    {} as Record<string, string>,
  );
