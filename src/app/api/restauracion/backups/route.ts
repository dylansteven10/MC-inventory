import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/server";
import { recordApiAudit } from "@/lib/audit/server";
import { queryAudit } from "@/lib/db/pool";
import { readInventoryCache } from "@/lib/inventory/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/restauracion/backups
 * List servers from inventory (EC2 + ECS) with ALL their available backups.
 * Uses inventory as source of truth for server list.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    // 1. Get servers from inventory (EC2 + ECS only)
    const cache = readInventoryCache();
    const inventoryItems: any[] = cache?.data || cache || [];
    const servers = inventoryItems.filter((item: any) =>
      (item.provider === "AWS" && item.service === "EC2") ||
      (item.provider === "HUAWEI CLOUD" && item.service === "ECS"),
    );

    // Build a map of resourceId → inventory info
    const inventoryMap = new Map<string, { name: string; accountName: string; accountId: string; provider: string; region: string; status: string; instanceType: string; imageId: string; subnetId: string; vpcId: string; availabilityZone: string; securityGroups: any; keyName: string; privateIp: string; publicIp: string; platform: string; operatingSystem: string }>();
    for (const s of servers) {
      inventoryMap.set(s.id, {
        name: s.name || s.id,
        accountName: s.accountName || "",
        accountId: s.accountId || "",
        provider: s.provider,
        region: s.region || "",
        status: s.status || "",
        instanceType: s.instanceType || "",
        imageId: s.imageId || "",
        subnetId: s.subnetId || "",
        vpcId: s.vpcId || "",
        availabilityZone: s.availabilityZone || "",
        securityGroups: s.securityGroups || [],
        keyName: s.keyName || "",
        privateIp: s.privateIp || "",
        publicIp: s.publicIp || "",
        platform: s.platform || "",
        operatingSystem: s.operatingSystem || "",
      });
    }

    // 2. Get ALL backups for these servers from server_backups
    const resourceIds = [...inventoryMap.keys()];
    if (resourceIds.length === 0) {
      return NextResponse.json({ servers: [], backups: [] });
    }

    // Query in chunks to avoid SQL parameter limits
    const CHUNK = 500;
    const allRows: any[] = [];
    for (let i = 0; i < resourceIds.length; i += CHUNK) {
      const chunk = resourceIds.slice(i, i + CHUNK);
      const ph = chunk.map((_, k) => `$${k + 1}`).join(", ");
      const res = await queryAudit(
        `SELECT provider, account_id, account_name, region,
          resource_id, resource_name, resource_type,
          backup_id, backup_name, status, size_bytes,
          backup_created_at, backup_completed_at,
          vault_name
        FROM server_backups
        WHERE resource_id IN (${ph})
          AND status IN ('COMPLETED', 'AVAILABLE')
          AND backup_completed_at >= now() - interval '7 days'
        ORDER BY resource_id, backup_completed_at DESC`,
        chunk,
      );
      allRows.push(...res.rows);
    }

    // 3. Group backups by resource_id
    const backupsByResource = new Map<string, any[]>();
    for (const r of allRows) {
      const list = backupsByResource.get(r.resource_id) || [];
      list.push({
        provider: r.provider,
        accountId: r.account_id,
        accountName: r.account_name,
        region: r.region,
        resourceId: r.resource_id,
        resourceName: r.resource_name || inventoryMap.get(r.resource_id)?.name || r.resource_id,
        resourceType: r.resource_type,
        backupId: r.backup_id,
        backupName: r.backup_name,
        status: r.status,
        sizeBytes: Number(r.size_bytes) || 0,
        backupCreatedAt: r.backup_created_at ? new Date(r.backup_created_at).toISOString() : null,
        backupCompletedAt: r.backup_completed_at ? new Date(r.backup_completed_at).toISOString() : null,
        vaultName: r.vault_name,
      });
      backupsByResource.set(r.resource_id, list);
    }

    // 4. Build server list from inventory, attaching backups
    const result = servers.map((s: any) => {
      const backups = backupsByResource.get(s.id) || [];
      return {
        provider: s.provider,
        accountId: s.accountId || "",
        accountName: s.accountName || "",
        region: s.region || "",
        resourceId: s.id,
        resourceName: s.name || s.id,
        resourceType: s.service === "EC2" ? "EC2" : "ECS",
        status: s.status || "",
        instanceType: s.instanceType || "",
        operatingSystem: s.operatingSystem || "",
        backups,
      };
    });

    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.backups.read",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
      metadata: { servers: result.length, backups: allRows.length },
    });

    return NextResponse.json({ servers: result });
  } catch (e: any) {
    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.backups.read",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
    });
    return NextResponse.json({ error: e.message || "Error loading backups" }, { status: 500 });
  }
}
