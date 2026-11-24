import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/server";
import { recordApiAudit } from "@/lib/audit/server";
import { queryAudit } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/restauracion/jobs
 * List restoration jobs.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    const res = await queryAudit(
      `SELECT id, provider, account_id, account_name,
        original_resource_id, original_resource_name,
        backup_id, restored_resource_name, restored_resource_id,
        status, created_at, completed_at, error
      FROM restore_jobs
      ORDER BY created_at DESC
      LIMIT 200`,
    );

    // Map snake_case DB columns to camelCase for the frontend
    const jobs = res.rows.map((r: any) => ({
      id: r.id,
      provider: r.provider,
      accountId: r.account_id,
      accountName: r.account_name,
      originalResourceId: r.original_resource_id,
      originalResourceName: r.original_resource_name,
      backupId: r.backup_id,
      restoredResourceName: r.restored_resource_name,
      restoredResourceId: r.restored_resource_id,
      status: r.status,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      error: r.error,
    }));

    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.jobs.read",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
    });

    return NextResponse.json({ jobs });
  } catch (e: any) {
    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.jobs.read",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
    });
    return NextResponse.json({ error: e.message || "Error loading jobs" }, { status: 500 });
  }
}
