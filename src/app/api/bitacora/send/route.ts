import { NextRequest, NextResponse } from "next/server";
import { recordApiAudit } from "@/lib/audit/server";
import { requireApiSession } from "@/lib/auth/server";
import { getEffectiveRecipients } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/sendgrid";
import { exportBitacoraToExcel } from "@/lib/exports/bitacora";
import type { BitacoraRecord } from "@/lib/backups/bitacora";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    const body = await request.json();
    const { records, tab, tabLabel, dateFrom, dateTo, filename } = body as {
      records: BitacoraRecord[];
      tab: string;
      tabLabel: string;
      dateFrom: string;
      dateTo: string;
      filename: string;
    };

    if (!records || records.length === 0) {
      return NextResponse.json({ success: false, error: "No hay datos para enviar" }, { status: 400 });
    }

    // Get recipients
    const { emails: recipients } = await getEffectiveRecipients();
    if (recipients.length === 0) {
      return NextResponse.json({ success: false, error: "Sin destinatarios configurados" }, { status: 400 });
    }

    // Generate Excel buffer
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(tabLabel || "Bitácora");

    // Headers
    const headers = ["Nube", "Cuenta", "Servicio", "Instancia", "Fecha", "Tipo", "Estado", "Tamaño"];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };

    // Data rows — sorted by provider A-Z, account A-Z
    const sorted = [...records].sort((a, b) => {
      const pc = (a.provider || "").localeCompare(b.provider || "");
      if (pc !== 0) return pc;
      const ac = (a.accountName || "").localeCompare(b.accountName || "");
      if (ac !== 0) return ac;
      return (a.instanceName || "").localeCompare(b.instanceName || "");
    });

    for (const r of sorted) {
      const sizeStr = r.sizeBytes > 0
        ? r.sizeBytes >= 1024 * 1024 * 1024
          ? `${(r.sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
          : r.sizeBytes >= 1024 * 1024
            ? `${(r.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
            : `${(r.sizeBytes / 1024).toFixed(2)} KB`
        : "—";
      const dateStr = r.backupDate
        ? `${r.backupDate.slice(0, 4)}/${r.backupDate.slice(4, 6)}/${r.backupDate.slice(6, 8)}`
        : "—";
      sheet.addRow([
        r.provider || "",
        r.accountName || "",
        r.service || "",
        r.instanceName || "",
        dateStr,
        r.backupType || "",
        r.status || "",
        sizeStr,
      ]);
    }

    // Auto-width columns
    for (let col = 1; col <= headers.length; col++) {
      let maxLen = headers[col - 1].length;
      for (let row = 2; row <= sheet.rowCount; row++) {
        const val = sheet.getCell(row, col).value?.toString() || "";
        if (val.length > maxLen) maxLen = val.length;
      }
      sheet.getColumn(col).width = Math.min(maxLen + 2, 40);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Build email HTML
    const tabNames: Record<string, string> = { server: "Servidores", rds: "Bases de datos", log: "Logs transaccionales" };
    const tabName = tabNames[tab] || tabLabel || "Bitácora";
    const now = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:960px;margin:0 auto;">
  <div style="background:#0f172a;padding:24px 32px;border-radius:12px 12px 0 0;">
    <table width="100%"><tr>
      <td><img src="https://i0.wp.com/ux.technology/wp-content/uploads/2023/08/Logo-UX-Technology.png?fit=150%2C80&ssl=1" alt="UX Technology" width="120" height="70" style="display:block;border-radius:10px;"></td>
      <td style="text-align:right;color:#94a3b8;font-size:12px;">${now}</td>
    </tr></table>
    <h2 style="color:#f1f5f9;margin:12px 0 4px;font-size:18px;">Bitácora de Backups — ${tabName}</h2>
    <p style="color:#94a3b8;font-size:13px;margin:0;">Rango: ${dateFrom} a ${dateTo} | ${records.length} registros</p>
  </div>
  <div style="background:#f8fafc;padding:20px 32px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
    <p style="font-size:13px;">Adjunto encontrarán el archivo Excel con la bitácora de backups.</p>
    <p style="font-size:12px;color:#64748b;">Este correo fue enviado manualmente desde MC Inventory.</p>
  </div>
</body></html>`;

    const text = `Bitácora de Backups — ${tabName}\nRango: ${dateFrom} a ${dateTo}\nRegistros: ${records.length}\n\nAdjunto: archivo Excel`;

    await sendEmail({
      to: recipients,
      subject: `[MC Inventory] Bitácora ${tabName} — ${dateFrom} a ${dateTo}`,
      html,
      text,
      attachments: [{
        content: base64,
        filename: filename || `bitacora-${tab}.xlsx`,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
    });

    await recordApiAudit(request, guard.session, {
      action: "data.bitacora.send_email",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
      metadata: { recipients, tab, records: records.length },
    });

    return NextResponse.json({ success: true, recipients });
  } catch (error: any) {
    await recordApiAudit(request, guard.session, {
      action: "data.bitacora.send_email",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
    });
    return NextResponse.json({ success: false, error: error?.message || "Error enviando correo" }, { status: 500 });
  }
}
