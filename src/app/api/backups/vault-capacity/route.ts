import { NextRequest, NextResponse } from "next/server";
import { recordApiAudit } from "@/lib/audit/server";
import { requireApiSession } from "@/lib/auth/server";
import { listVaultCapacity } from "@/lib/backups/repository-extended";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    const provider = request.nextUrl.searchParams.get("provider") || undefined;
    const data = await listVaultCapacity(provider);

    await recordApiAudit(request, guard.session, {
      action: "data.vault-capacity.view",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
    });

    return NextResponse.json({ vaults: data });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar vault capacity" }, { status: 500 });
  }
}
