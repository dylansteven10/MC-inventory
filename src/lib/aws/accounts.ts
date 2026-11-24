import { resolveSecret } from "@/lib/secrets/crypto";

export type AWSAccount = {
  name: string;
  id: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** All regions configured for this account (for reference/iteration) */
  regions: string[];
};

/**
 * Parse a comma-separated REGIONS env var into an array.
 * Falls back to single REGION var, then AWS_REGION global, then us-east-1.
 */
function parseAccountRegions(index: number): string[] {
  const regionsVar = process.env[`AWS_ACCOUNT_${index}_REGIONS`];
  if (regionsVar && regionsVar.trim()) {
    return regionsVar.split(",").map((r) => r.trim()).filter(Boolean);
  }
  const singleRegion =
    process.env[`AWS_ACCOUNT_${index}_REGION`] ||
    process.env.AWS_REGION ||
    "us-east-1";
  return [singleRegion];
}

/**
 * Get all AWS accounts, expanded per-region.
 * If an account has REGIONS=us-east-1,us-west-2, two account entries are returned
 * (same credentials, different region). Each entry has `region` set to the
 * specific region and `regions` containing all configured regions.
 */
export function getAWSAccounts(): AWSAccount[] {
  const accounts: AWSAccount[] = [];
  let i = 1;

  while (process.env[`AWS_ACCOUNT_${i}_NAME`] || process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY`] || process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY_ID`]) {
    const accessKeyId = resolveSecret(
      process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY_ID`] ||
      process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY`],
    );

    const secretAccessKey = resolveSecret(
      process.env[`AWS_ACCOUNT_${i}_SECRET_ACCESS_KEY`] ||
      process.env[`AWS_ACCOUNT_${i}_SECRET_KEY`],
    );

    if (!accessKeyId || !secretAccessKey) {
      i++;
      continue;
    }

    const name = process.env[`AWS_ACCOUNT_${i}_NAME`] || "N/A";
    const id = process.env[`AWS_ACCOUNT_${i}_ID`] || "N/A";
    const regions = parseAccountRegions(i);

    // Expand: one account entry per region
    for (const region of regions) {
      accounts.push({ name, id, accessKeyId, secretAccessKey, region, regions });
    }

    i++;
  }

  return accounts;
}

/**
 * Get unique AWS accounts (one per account ID, regardless of region).
 * Useful for billing and global operations where region doesn't matter.
 */
export function getUniqueAWSAccounts(): AWSAccount[] {
  const seen = new Set<string>();
  return getAWSAccounts().filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}
