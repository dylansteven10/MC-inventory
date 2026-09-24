import { queryAudit } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await queryAudit("SELECT 1");
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return new Response(JSON.stringify({ status: "unavailable" }), {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
