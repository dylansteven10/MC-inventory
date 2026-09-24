import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/server";
import { queryAudit } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  const guard = await requireApiSession("inventory:modify", request);
  if (guard.response) return guard.response;

  try {
    const { columns } = await request.json();
    if (!Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json({ error: "columns array is required" }, { status: 400 });
    }

    for (const col of columns) {
      if (!col.id || typeof col.position !== "number") {
        return NextResponse.json({ error: "Each column must have id and position" }, { status: 400 });
      }
    }

    await queryAudit("BEGIN");
    try {
      for (const col of columns) {
        await queryAudit(
          "UPDATE server_columns SET position = $1 WHERE id = $2",
          [col.position, col.id]
        );
      }
      await queryAudit("COMMIT");
    } catch (err) {
      await queryAudit("ROLLBACK");
      throw err;
    }

    const result = await queryAudit(
      "SELECT id, name, position, created_at FROM server_columns ORDER BY position ASC"
    );
    return NextResponse.json({ columns: result.rows });
  } catch {
    return NextResponse.json({ error: "Failed to reorder columns" }, { status: 500 });
  }
}
