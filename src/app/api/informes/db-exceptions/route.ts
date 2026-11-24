import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/server";
import { recordApiAudit } from "@/lib/audit/server";
import { listDbExceptions, addDbException, removeDbException } from "@/lib/email/db-exceptions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    const exceptions = await listDbExceptions();
    return NextResponse.json({ exceptions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireApiSession("inventory:modify", request);
  if (guard.response) return guard.response;

  try {
    const body = await request.json();
    const { pattern, reason, weekendExempt, accountId, accountName } = body;
    if (!pattern || typeof pattern !== "string" || !pattern.trim()) {
      return NextResponse.json({ error: "pattern is required" }, { status: 400 });
    }
    const exception = await addDbException(
      pattern.trim(),
      typeof reason === "string" ? reason.trim() : undefined,
      guard.session.user?.email,
      !!weekendExempt,
      typeof accountId === "string" && accountId.trim() ? accountId.trim() : null,
      typeof accountName === "string" && accountName.trim() ? accountName.trim() : null,
    );
    await recordApiAudit(request, guard.session, {
      action: "informes.db_exceptions.add",
      category: "configuration",
      result: "success",
      statusCode: 201,
      metadata: { pattern: exception.pattern },
    }).catch(() => undefined);
    return NextResponse.json({ exception }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireApiSession("inventory:modify", request);
  if (guard.response) return guard.response;

  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const removed = await removeDbException(id);
    if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await recordApiAudit(request, guard.session, {
      action: "informes.db_exceptions.remove",
      category: "configuration",
      result: "success",
      statusCode: 200,
      metadata: { id },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
