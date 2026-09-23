import { NextRequest, NextResponse } from "next/server";

import { queryAudit } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await queryAudit(
      "SELECT id, name, position, created_at FROM server_columns ORDER BY position ASC"
    );
    return NextResponse.json({ columns: result.rows });
  } catch {
    return NextResponse.json({ columns: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const maxPos = await queryAudit("SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM server_columns");
    const position = maxPos.rows[0].next_pos;
    const result = await queryAudit(
      "INSERT INTO server_columns (name, position) VALUES ($1, $2) RETURNING id, name, position, created_at",
      [name.trim(), position]
    );
    return NextResponse.json({ column: result.rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create column" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, name } = await request.json();
    if (!id || !name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }
    const result = await queryAudit(
      "UPDATE server_columns SET name = $1 WHERE id = $2 RETURNING id, name, position, created_at",
      [name.trim(), id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 });
    }
    return NextResponse.json({ column: result.rows[0] });
  } catch {
    return NextResponse.json({ error: "Failed to update column" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await queryAudit("DELETE FROM server_column_values WHERE column_id = $1", [id]);
    await queryAudit("DELETE FROM server_columns WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete column" }, { status: 500 });
  }
}
