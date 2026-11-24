import { NextRequest, NextResponse } from "next/server";
import { recordApiAudit } from "@/lib/audit/server";
import { requireApiSession } from "@/lib/auth/server";
import { listBitacora, getBitacoraFilterOptions, populateBitacora, getBitacoraTypeStats } from "@/lib/backups/bitacora";

export const dynamic = "force-dynamic";

// Server-side cache for filter options (refreshed every 5 min)
let filterCache: { data: any; ts: number } | null = null;
const FILTER_CACHE_TTL = 5 * 60 * 1000;

async function getCachedFilterOptions() {
  if (filterCache && Date.now() - filterCache.ts < FILTER_CACHE_TTL) {
    return filterCache.data;
  }
  const data = await getBitacoraFilterOptions();
  filterCache = { data, ts: Date.now() };
  return data;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    const params = request.nextUrl.searchParams;
    const page = Number(params.get("page") || 1);
    const pageSize = Number(params.get("pageSize") || 50);
    const needFilters = params.get("needFilters") === "1";

    const filters = {
      provider: params.get("provider") || undefined,
      accountId: params.get("accountId") || undefined,
      service: params.get("service") || undefined,
      instanceName: params.get("instanceName") || undefined,
      backupType: params.get("backupType") || undefined,
      status: params.get("status") || undefined,
      dateFrom: params.get("dateFrom") || undefined,
      dateTo: params.get("dateTo") || undefined,
      search: params.get("search") || undefined,
      sortBy: params.get("sortBy") || undefined,
      sortDir: (params.get("sortDir") || undefined) as "asc" | "desc" | undefined,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    };

    // Only fetch filter options on first load (needFilters=1) or every 5 min via cache
    const [recordsResult, typeStats, filterOptions] = await Promise.all([
      listBitacora(filters),
      getBitacoraTypeStats(filters),
      needFilters ? getCachedFilterOptions() : Promise.resolve(null),
    ]);

    const { records, total } = recordsResult;

    await recordApiAudit(request, guard.session, {
      action: "data.bitacora.read",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
      metadata: { returned: records.length, total },
    });

    const response: Record<string, any> = { records, total, page, pageSize, typeStats };
    if (filterOptions) response.filterOptions = filterOptions;
    return NextResponse.json(response);
  } catch (error: any) {
    await recordApiAudit(request, guard.session, {
      action: "data.bitacora.read",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
    });
    return NextResponse.json({ error: error?.message || "Failed to load bitácora" }, { status: 500 });
  }
}

/** POST: Repopulate bitácora from backup tables */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    const result = await populateBitacora();
    const total = result.serverRows + result.rdsRows + result.logRows + result.gapRows;
    // Invalidate filter cache after populate
    filterCache = null;

    await recordApiAudit(request, guard.session, {
      action: "data.bitacora.populate",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
      metadata: result,
    });

    return NextResponse.json({ ok: true, ...result, total });
  } catch (error: any) {
    await recordApiAudit(request, guard.session, {
      action: "data.bitacora.populate",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
    });
    return NextResponse.json({ error: error?.message || "Failed to populate bitácora" }, { status: 500 });
  }
}
