import type { InventoryItem } from "@/types/inventory";

// Lazy-loaded account region maps (built once on first use)
let awsAccountRegions: Map<string, string[]> | null = null;
let hwAccountRegions: Map<string, string[]> | null = null;

function getAWSAccountRegions(): Map<string, string[]> {
  if (awsAccountRegions) return awsAccountRegions;
  awsAccountRegions = new Map();
  try {
    // Dynamic require to avoid circular deps at module load time
    const { getAWSAccounts } = require("@/lib/aws/accounts");
    for (const a of getAWSAccounts()) {
      const list = awsAccountRegions.get(a.id) || [];
      if (!list.includes(a.region)) list.push(a.region);
      awsAccountRegions.set(a.id, list);
    }
  } catch { /* ignore if accounts not available */ }
  return awsAccountRegions;
}

function getHWAccountRegions(): Map<string, string[]> {
  if (hwAccountRegions) return hwAccountRegions;
  hwAccountRegions = new Map();
  try {
    const { getHuaweiAccounts } = require("@/lib/huawei/accounts");
    for (const a of getHuaweiAccounts()) {
      const list = hwAccountRegions.get(a.projectId) || [];
      if (!list.includes(a.region)) list.push(a.region);
      hwAccountRegions.set(a.projectId, list);
    }
  } catch { /* ignore */ }
  return hwAccountRegions;
}

/**
 * Derive the `region` field for each inventory item from:
 * 1. Explicit `availabilityZone` that is already a region (e.g., "us-east-1", "la-north-2")
 * 2. `availabilityZone` that is an AZ (e.g., "us-east-1a", "la-north-2a") → strip last char
 * 3. Multi-AZ string (e.g., "us-east-1a, us-east-1b") → extract from first AZ
 * 4. Fallback: derive from account configuration (first region for that account)
 * 5. CloudFront/CDN → "global"
 *
 * This is applied after all collectors have run, as a post-processing step.
 */
export function enrichRegion(items: InventoryItem[]): void {
  // Reset caches for fresh build
  awsAccountRegions = null;
  hwAccountRegions = null;

  for (const item of items) {
    if (item.region) continue; // Already set by collector

    const az = item.availabilityZone;
    if (az && az !== "none" && az !== "N/A") {
      // Case 1: availabilityZone is already a bare region (e.g., "us-east-1", "la-north-2")
      if (isRegion(az)) {
        item.region = az;
        continue;
      }

      // Case 2: Multi-AZ string (e.g., "us-east-1a, us-east-1b" or "us-east-1a,us-east-1b")
      const parts = az.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        const firstAz = parts[0];
        const derivedRegion = stripAzLetter(firstAz);
        if (derivedRegion) {
          item.region = derivedRegion;
          continue;
        }
      }
    }

    // Case 3: Derive from account configuration
    if (item.provider === "AWS" && item.accountId) {
      const regions = getAWSAccountRegions().get(item.accountId);
      if (regions && regions.length > 0) {
        // Use first region (primary) for items without explicit AZ
        // Special case: CloudFront is global
        if (item.service === "CloudFront") {
          item.region = "global";
        } else {
          item.region = regions[0];
        }
        continue;
      }
    }

    if (item.provider === "HUAWEI CLOUD" && item.accountId) {
      const regions = getHWAccountRegions().get(item.accountId);
      if (regions && regions.length > 0) {
        if (item.service === "CDN") {
          item.region = "global";
        } else {
          item.region = regions[0];
        }
        continue;
      }
    }

    // Case 4: Global services
    if (item.service === "CloudFront" || item.service === "CDN") {
      item.region = "global";
    }
  }
}

/**
 * Check if a string looks like a bare region (no AZ letter suffix).
 */
function isRegion(s: string): boolean {
  // AWS/Huawei pattern: 2-letter area + direction + number
  if (/^[a-z]{2}-[a-z]+-\d+$/.test(s)) return true;
  const KNOWN_REGIONS = new Set([
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1",
    "eu-north-1", "ap-southeast-1", "ap-southeast-2",
    "ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
    "ap-south-1", "sa-east-1", "ca-central-1",
    "la-north-2", "la-south-2", "cn-north-1", "cn-north-4",
    "cn-east-2", "cn-east-3", "cn-south-1", "cn-southwest-2",
    "ap-southeast-3", "ap-southeast-4", "tr-west-1",
    "me-south-1", "af-south-1", "il-central-1",
    "na-mexico-1",
  ]);
  return KNOWN_REGIONS.has(s);
}

/**
 * Strip the availability zone letter from an AZ string.
 * "us-east-1a" → "us-east-1", "la-north-2a" → "la-north-2"
 */
function stripAzLetter(az: string): string | null {
  const match = az.match(/^(.+)-(\d)([a-z])$/);
  if (match) return `${match[1]}-${match[2]}`;
  if (isRegion(az)) return az;
  return null;
}
