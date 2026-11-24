import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/server";
import { recordApiAudit } from "@/lib/audit/server";
import { listExceptions, addException, removeException } from "@/lib/email/exceptions";

export const dynamic = "force-dynamic";

// GET: list all exceptions
export async function GET(request: Request) {
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  const exceptions = await listExceptions();
  return NextResponse.json({ exceptions });
}

// POST: add exception { pattern, reason? }
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:modify", request);
  if (guard.response) return guard.response;

  try {
    const body = await request.json();
    const pattern = String(body.pattern || "").trim();
    const reason = String(body.reason || "").trim();

    if (!pattern) {
      return NextResponse.json({ error: "Pattern is required" }, { status: 400 });
    }

    const exception = await addException(pattern, reason, guard.session?.user?.email || "unknown");

    await recordApiAudit(request, guard.session, {
      action: "exception.add",
      category: "system",
      result: "success",
      statusCode: 201,
      startedAt,
      metadata: { pattern, reason },
    });

    return NextResponse.json({ exception }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Error adding exception" }, { status: 500 });
  }
}

// DELETE: ?id= — remove exception
export async function DELETE(request: Request) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:modify", request);
  if (guard.response) return guard.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const ok = await removeException(id);

  await recordApiAudit(request, guard.session, {
    action: "exception.remove",
    category: "system",
    result: ok ? "success" : "error",
    statusCode: ok ? 200 : 404,
    startedAt,
    metadata: { id },
  });

  return NextResponse.json({ ok });
}
