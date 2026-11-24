import { getAWSAccounts as getConfiguredAWSAccounts, getUniqueAWSAccounts as getUniqueConfiguredAWSAccounts } from "@/lib/aws/accounts";

export interface AWSAccount {
  name: string;
  id: string;
  accessKey: string;
  secretKey: string;
  region: string;
  regions: string[];
}

export function getAWSAccounts(): AWSAccount[] {
  return getConfiguredAWSAccounts().map((account) => ({
    name: account.name,
    id: account.id,
    accessKey: account.accessKeyId,
    secretKey: account.secretAccessKey,
    region: account.region,
    regions: account.regions,
  }));
}

export function getUniqueAWSAccounts(): AWSAccount[] {
  return getUniqueConfiguredAWSAccounts().map((account) => ({
    name: account.name,
    id: account.id,
    accessKey: account.accessKeyId,
    secretKey: account.secretAccessKey,
    region: account.region,
    regions: account.regions,
  }));
}

export function getAWSAccountById(id: string, region?: string): AWSAccount | undefined {
  const accounts = getAWSAccounts();
  if (region) {
    return accounts.find((acc) => acc.id === id && acc.region === region);
  }
  return accounts.find((acc) => acc.id === id);
}

export function getAWSAccountByNameOrId(nameOrId: string): AWSAccount | undefined {
  return getAWSAccounts().find((acc) => acc.name === nameOrId || acc.id === nameOrId);
}

export function getDefaultAWSAccount(): AWSAccount | undefined {
  return getAWSAccounts()[0];
}

/**
 * Get all regions configured for a given AWS account ID.
 */
export function getAWSAccountRegions(accountId: string): string[] {
  const accounts = getConfiguredAWSAccounts().filter((a) => a.id === accountId);
  return [...new Set(accounts.map((a) => a.region))].sort();
}
