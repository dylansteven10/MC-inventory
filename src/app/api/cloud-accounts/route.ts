import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/server";
import { listCloudAccounts, upsertCloudAccount, removeCloudAccount, syncEnvAccountsToDb } from "@/lib/cloud/accounts";

export const dynamic = "force-dynamic";

/** List all cloud accounts (optionally filtered by provider) */
export async function GET(request: NextRequest) {
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    const provider = request.nextUrl.searchParams.get("provider") || undefined;
    const accounts = await listCloudAccounts(provider as any);
    return NextResponse.json({ accounts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Add/update a cloud account, or sync from env vars */
export async function POST(request: NextRequest) {
  const guard = await requireApiSession("inventory:modify", request);
  if (guard.response) return guard.response;

  try {
    const body = await request.json();

    // Special action: sync from env vars
    if (body.action === "sync") {
      const count = await syncEnvAccountsToDb(guard.session.user?.email);
      return NextResponse.json({ synced: count });
    }

    const { provider, name, accountId, region, accessKeyEnc, secretKeyEnc, displayName, environment, active } = body;
    if (!provider || !name || !accountId || !region) {
      return NextResponse.json({ error: "provider, name, accountId, and region are required" }, { status: 400 });
    }
    if (!["AWS", "HUAWEI CLOUD"].includes(provider)) {
      return NextResponse.json({ error: "provider must be AWS or HUAWEI CLOUD" }, { status: 400 });
    }

    const account = await upsertCloudAccount(provider, name, accountId, region, {
      accessKeyEnc,
      secretKeyEnc,
      displayName,
      environment,
      active: active !== undefined ? active : true,
      createdBy: guard.session.user?.email,
    });
    return NextResponse.json({ account });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Remove a cloud account */
export async function DELETE(request: NextRequest) {
  const guard = await requireApiSession("inventory:modify", request);
  if (guard.response) return guard.response;

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const removed = await removeCloudAccount(id);
    return NextResponse.json({ removed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
