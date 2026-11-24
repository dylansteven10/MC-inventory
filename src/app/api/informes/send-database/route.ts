import { NextRequest, NextResponse } from "next/server";
import { recordApiAudit } from "@/lib/audit/server";
import { requireApiSession } from "@/lib/auth/server";
import { sendEmail, getSendGridConfig } from "@/lib/email/sendgrid";
import { generateDatabasesEmailHtml, generateDatabasesEmailText, generateDatabasesInformeFromItems } from "@/lib/email/informe-databases";
import { buildDatabaseReportRows } from "@/lib/inventory/exportDatabases";
import type { InventoryItem } from "@/types/inventory";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    // Get inventory data from request body
    const body = await request.json();
    const items: InventoryItem[] = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ error: "No hay datos de bases de datos para enviar" }, { status: 400 });
    }

    const reportRows = buildDatabaseReportRows(
      items.filter((i) => ["RDS", "Aurora", "DocumentDB", "DDS", "ElastiCache"].includes(i.service)),
    );

    if (reportRows.length === 0) {
      return NextResponse.json({ error: "No se encontraron bases de datos en los datos proporcionados" }, { status: 400 });
    }

    const data = generateDatabasesInformeFromItems(reportRows);
    const subject = `Informe de bases de datos — ${data.dateLabel}`;
    const html = generateDatabasesEmailHtml(data);
    const text = generateDatabasesEmailText(data);

    // Use effective recipients (DB > env), same as all other informe types
    const config = await getSendGridConfig();
    if (config.recipients.length === 0) {
      return NextResponse.json({ error: "No hay destinatarios configurados" }, { status: 400 });
    }

    const result = await sendEmail({
      to: config.recipients,
      subject,
      html,
      text,
    });

    await recordApiAudit(request, guard.session, {
      action: "informe.send.databases",
      category: "system",
      result: result.success ? "success" : "error",
      statusCode: result.success ? 200 : 500,
      startedAt,
      metadata: {
        recipients: config.recipients,
        totalDatabases: reportRows.length,
        dateLabel: data.dateLabel,
      },
    });

    if (!result.success) {
      return NextResponse.json({ error: "Error enviando correo" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      recipients: config.recipients,
      totalDatabases: reportRows.length,
      dateLabel: data.dateLabel,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error enviando informe de bases de datos" },
      { status: 500 },
    );
  }
}
