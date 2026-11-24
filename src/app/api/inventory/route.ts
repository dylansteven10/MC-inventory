import { NextRequest, NextResponse } from "next/server";

import { recordApiAudit } from "@/lib/audit/server";
import { requireApiSession } from "@/lib/auth/server";
import { queryAudit } from "@/lib/db/pool";

import { getAWSInventory } from "@/lib/aws";

import {
  getHuaweiECSInventory
} from "@/lib/huawei/ecs";

import {
  getHuaweiRDSInventory
} from "@/lib/huawei/rds";

import {
  getHuaweiVPCInventory
} from "@/lib/huawei/vpc";

import {
  getHuaweiSubnetInventory
} from "@/lib/huawei/subnet";

import {
  getHuaweiOBSInventory
} from "@/lib/huawei/obs";

import {
  getHuaweiELBInventory
} from "@/lib/huawei/elb";

import {
  getHuaweiCCEInventory
} from "@/lib/huawei/cce";

import {
  getHuaweiCDNInventory
} from "@/lib/huawei/cdn";

import {
  getHuaweiDDSInventory
} from "@/lib/huawei/dds";

import {
  enrichRelationships
} from "@/lib/inventory/enrichRelationships";

import { enrichRegion } from "@/lib/inventory/enrichRegion";

import {

  readInventoryCache,
  writeInventoryCache

} from "@/lib/inventory/cache";

import { upsertDatabaseInventory } from "@/lib/backups/repository-extended";

export const dynamic =
  "force-dynamic";
export const runtime = "nodejs";

const CACHE_TTL =
  100 * 60 * 10;

/* ───────────────────────────── */
/* GLOBAL REFRESH LOCK */
/* ───────────────────────────── */

let refreshing =
  false;

/* ───────────────────────────── */
/* BUILD INVENTORY */
/* ───────────────────────────── */

async function buildInventory() {

  console.time(
    "inventory-build"
  );

  // 1. Primero obtener CCE para extraer los server IDs de los nodos
  let cceInventory: any[] = [];
  const cceNodeServerIds: string[] = [];

  try {
    cceInventory = await getHuaweiCCEInventory();

    // Extraer server IDs de todos los nodos CCE
    for (const item of cceInventory) {
      if (item.children && Array.isArray(item.children)) {
        for (const child of item.children) {
          if (child.raw?.status?.serverId) {
            cceNodeServerIds.push(child.raw.status.serverId);
          }
        }
      }
    }

    console.log(`✅ [CCE]: ${cceInventory.length} clusters, ${cceNodeServerIds.length} nodos detectados`);
  } catch (error) {
    console.error(`❌ INVENTORY FETCH FAILED [CCE]:`, error);
  }

  // 2. Luego obtener el resto de servicios, pasando los IDs a excluir en ECS
  const results = await Promise.allSettled([

    getAWSInventory(),

    getHuaweiECSInventory(cceNodeServerIds),
    getHuaweiRDSInventory(),
    getHuaweiVPCInventory(),
    getHuaweiSubnetInventory(),
    getHuaweiOBSInventory(),
    getHuaweiELBInventory(),
    getHuaweiCDNInventory(),
    getHuaweiDDSInventory()

  ]);

  // Extract successful results, log failures
  const getData = (result: PromiseSettledResult<any[]>, name: string) => {
    if (result.status === "fulfilled") {
      const data = result.value || [];
      console.log(`✅ [${name}]: ${data.length} items fetched`);
      return data;
    }
    console.error(`❌ INVENTORY FETCH FAILED [${name}]:`, result.reason);
    return [];
  };

  const allInventory = [

    ...getData(results[0], "AWS"),

    ...getData(results[1], "Huawei-ECS"),
    ...getData(results[2], "Huawei-RDS"),
    ...getData(results[3], "Huawei-VPC"),
    ...getData(results[4], "Huawei-Subnet"),
    ...getData(results[5], "Huawei-OBS"),
    ...getData(results[6], "Huawei-ELB"),
    ...cceInventory, // Ya obtenido arriba
    ...getData(results[7], "Huawei-CDN"),
    ...getData(results[8], "Huawei-DDS")

  ];

  const enriched =
    enrichRelationships(
      allInventory
    );

  // Enrich region field from availabilityZone or account config
  enrichRegion(enriched);

  console.timeEnd(
    "inventory-build"
  );

  // Persistir bases de datos en la BD para el informe
  try {
    const DB_SERVICES = new Set(["RDS", "Aurora", "DocumentDB", "DDS", "ElastiCache"]);
    const dbItems = enriched.filter((i: any) => DB_SERVICES.has(i.service));
    if (dbItems.length > 0) {
      await upsertDatabaseInventory(
        dbItems.map((i: any) => ({
          provider: i.provider || "N/A",
          accountId: i.accountId || "",
          accountName: i.accountName || "",
          name: i.name || "",
          engine: i.engine || i.operatingSystem || "",
          engineVersion: i.engineVersion || "",
          status: i.status || "",
          host: i.host || "",
        })),
      );
    }
  } catch (err) {
    console.error("Failed to persist database_inventory:", err);
  }

  return enriched;

}

/* ───────────────────────────── */
/* BACKGROUND REFRESH */
/* ───────────────────────────── */

async function refreshInventory() {

  try {

    console.log(
      "BACKGROUND REFRESH START"
    );

    const inventory =
      await buildInventory();

    writeInventoryCache({

      timestamp:
        Date.now(),

      data:
        inventory

    });

    console.log(
      "BACKGROUND REFRESH DONE"
    );

  } catch (err) {

    console.error(
      "BACKGROUND REFRESH ERROR:",
      err
    );

  }

}

/* ───────────────────────────── */
/* API */
/* ───────────────────────────── */

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const guard = await requireApiSession("inventory:view", request);
    if (guard.response) return guard.response;

    // ?refresh=true forces a cache bypass and full rebuild
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

    if (forceRefresh && !refreshing) {
      refreshing = true;
      console.log("[inventory] FORCE REFRESH requested — rebuilding inventory...");
      try {
        const inventory = await buildInventory();
        writeInventoryCache({ timestamp: Date.now(), data: inventory });

        await recordApiAudit(request, guard.session, {
          action: "inventory.refresh",
          result: "success",
          statusCode: 200,
          startedAt,
          metadata: { source: "force-refresh", itemCount: inventory.length },
        });

        // Enrich with version info
        let enrichedData = inventory;
        try {
          const DB_SERVICES = new Set(["RDS", "Aurora", "DocumentDB", "DDS", "ElastiCache"]);
          const hasDbs = inventory.some((i: any) => DB_SERVICES.has(i.service));
          if (hasDbs) {
            const dbInvRes = await queryAudit<{
              provider: string; account_id: string; name: string;
              latest_patch: string; update_status: string; update_observation: string;
            }>(`SELECT provider, account_id, name, latest_patch, update_status, update_observation FROM database_inventory WHERE latest_patch != ''`);
            const dbMap = new Map<string, { latestPatch: string; updateStatus: string; updateObservation: string }>();
            for (const r of dbInvRes.rows) {
              dbMap.set(`${r.provider}|${r.account_id}|${r.name}`, {
                latestPatch: r.latest_patch,
                updateStatus: r.update_status,
                updateObservation: r.update_observation,
              });
            }
            enrichedData = inventory.map((item: any) => {
              if (!DB_SERVICES.has(item.service)) return item;
              const key = `${item.provider}|${item.accountId}|${item.name}`;
              const vi = dbMap.get(key);
              if (!vi) return item;
              return { ...item, latestPatch: vi.latestPatch, updateStatus: vi.updateStatus, updateObservation: vi.updateObservation };
            });
          }
        } catch { /* ignore */ }

        return NextResponse.json({ source: "force-refresh", timestamp: Date.now(), refreshing: false, data: enrichedData });
      } finally {
        refreshing = false;
      }
    }

    const cached =
      readInventoryCache();

    /* ───────────────────────── */
    /* CACHE EXISTS */
    /* ───────────────────────── */

    if (cached) {

      const age =
        Date.now() -
        cached.timestamp;

      console.log(
        `CACHE AGE: ${Math.floor(age / 1000)}s`
      );

      /* ─────────────────────── */
      /* AUTO REFRESH BG */
      /* ─────────────────────── */

      const shouldRefresh =

        age > CACHE_TTL &&

        !refreshing;

      if (shouldRefresh) {

        refreshing = true;

        refreshInventory()
          .finally(() => {

            refreshing = false;

          });

      }

      await recordApiAudit(request, guard.session, {
        action: "inventory.view",
        result: "success",
        statusCode: 200,
        startedAt,
        metadata: { source: "cache", itemCount: cached.data.length },
      });

      // Enrich database items with version info from database_inventory
      let enrichedData = cached.data;
      try {
        const DB_SERVICES = new Set(["RDS", "Aurora", "DocumentDB", "DDS", "ElastiCache"]);
        const hasDbs = cached.data.some((i: any) => DB_SERVICES.has(i.service));
        if (hasDbs) {
          const dbInvRes = await queryAudit<{
            provider: string; account_id: string; name: string;
            latest_patch: string; update_status: string; update_observation: string;
          }>(`SELECT provider, account_id, name, latest_patch, update_status, update_observation FROM database_inventory WHERE latest_patch != ''`);
          const dbMap = new Map<string, { latestPatch: string; updateStatus: string; updateObservation: string }>();
          for (const r of dbInvRes.rows) {
            dbMap.set(`${r.provider}|${r.account_id}|${r.name}`, {
              latestPatch: r.latest_patch,
              updateStatus: r.update_status,
              updateObservation: r.update_observation,
            });
          }
          enrichedData = cached.data.map((item: any) => {
            if (!DB_SERVICES.has(item.service)) return item;
            const key = `${item.provider}|${item.accountId}|${item.name}`;
            const vi = dbMap.get(key);
            if (!vi) return item;
            return { ...item, latestPatch: vi.latestPatch, updateStatus: vi.updateStatus, updateObservation: vi.updateObservation };
          });
        }
      } catch { /* ignore if table doesn't exist yet */ }

      return NextResponse.json({

        source:
          "cache",

        timestamp:
          cached.timestamp,

        refreshing,

        data:
          enrichedData

      });

    }

    /* ───────────────────────── */
    /* FIRST LOAD */
    /* ───────────────────────── */

    console.log(
      "NO CACHE FOUND"
    );

    refreshing = true;

    const inventory =
      await buildInventory();

    writeInventoryCache({

      timestamp:
        Date.now(),

      data:
        inventory

    });

    refreshing = false;

    await recordApiAudit(request, guard.session, {
      action: "inventory.view",
      result: "success",
      statusCode: 200,
      startedAt,
      metadata: { source: "fresh", itemCount: inventory.length },
    });
    return NextResponse.json({

      source:
        "fresh",

      timestamp:
        Date.now(),

      refreshing:
        false,

      data:
        inventory

    });

  } catch {

    refreshing = false;

    const guard = await requireApiSession(undefined, request);
    if (guard.session) {
      await recordApiAudit(request, guard.session, {
        action: "inventory.view",
        result: "error",
        statusCode: 500,
        startedAt,
      });
    }

    return NextResponse.json(

      {

        error:
          "Error fetching inventory"

      },

      {

        status: 500

      }

    );

  }

}
