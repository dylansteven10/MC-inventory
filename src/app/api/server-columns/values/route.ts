import { NextRequest, NextResponse } from "next/server";

import { queryAudit } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await queryAudit(
      "SELECT id, column_id, server_id, value, created_at, updated_at FROM server_column_values ORDER BY updated_at DESC"
    );
    return NextResponse.json({ values: result.rows });
  } catch {
    return NextResponse.json({ values: [] });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { columnId, serverId, value } = await request.json();
    if (!columnId || !serverId) {
      return NextResponse.json({ error: "columnId and serverId are required" }, { status: 400 });
    }
    const result = await queryAudit(
      `INSERT INTO server_column_values (column_id, server_id, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (column_id, server_id)
       DO UPDATE SET value = $3, updated_at = NOW()
       RETURNING id, column_id, server_id, value, created_at, updated_at`,
      [columnId, serverId, value || ""]
    );
    return NextResponse.json({ value: result.rows[0] });
  } catch {
    return NextResponse.json({ error: "Failed to save value" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { columnId, serverId } = await request.json();
    if (!columnId || !serverId) {
      return NextResponse.json({ error: "columnId and serverId are required" }, { status: 400 });
    }
    await queryAudit(
      "DELETE FROM server_column_values WHERE column_id = $1 AND server_id = $2",
      [columnId, serverId]
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete value" }, { status: 500 });
  }
}
