import { getBogotaNow } from "@/lib/backups/scheduler";
import { isBackupRefreshRunning, refreshBackups } from "@/lib/backups/collector";
import { generateInformeData, generateEmailHtml, generateEmailText } from "@/lib/email/informe";
import { generateRdsInformeData, generateRdsEmailHtml, generateRdsEmailText } from "@/lib/email/informe-rds";
import { generateLogsInformeData, generateLogsEmailHtml, generateLogsEmailText } from "@/lib/email/informe-logs";
import { generateDatabasesInformeData, generateDatabasesEmailHtml, generateDatabasesEmailText } from "@/lib/email/informe-databases";
import { generateVaultsInformeData, generateVaultsEmailHtml, generateVaultsEmailText } from "@/lib/email/informe-vaults";
import { isSendGridConfigured, sendEmail } from "@/lib/email/sendgrid";
import { getEffectiveRecipients, type ReportType as RecipientReportType } from "@/lib/email/recipients";
import { queryAudit } from "@/lib/db/pool";
import { recordSystemAuditEvent } from "@/lib/audit/server";

declare global {
  var __mcInventoryInformeScheduler: boolean | undefined;
}

const DB_INFORME_RECIPIENTS = ["jean.novoa@ux.technology", "dilan.bolano@ux.technology"];

function getInformeScheduleHour(): number {
  const raw = Number(process.env.INFORMES_SCHEDULE_HOUR || 7);
  if (!Number.isInteger(raw) || raw < 0 || raw > 23) return 7;
  return raw;
}

/**
 * Fecha Bogotá (YYYY-MM-DD) del último envío registrado en informe_send_log.
 *
 * `reportType` filtra por tipo de informe (p. ej. "databases"). Sin filtro,
 * considera los informes diarios (servers/rds/logs/vaults/daily).
 *
 * Devuelve `{ ok: false }` si la BD no responde: el scheduler NO debe
 * enviar correos cuando no puede verificar si ya se envió (fail-safe).
 * Un reinicio del contenedor con la BD degradada jamás dispara envíos.
 */
async function getLastInformeSentDay(reportType?: string): Promise<{ ok: boolean; day: string | null }> {
  try {
    const res = reportType
      ? await queryAudit(
          `SELECT sent_at FROM informe_send_log WHERE details->>'reportType' = $1 ORDER BY sent_at DESC LIMIT 1`,
          [reportType],
        )
      : await queryAudit(
          `SELECT sent_at FROM informe_send_log WHERE details->>'reportType' IN ('servers','rds','logs','vaults','daily') ORDER BY sent_at DESC LIMIT 1`,
        );
    if (!res.rows[0]) return { ok: true, day: null };
    const d = new Date(res.rows[0].sent_at);
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return { ok: true, day };
  } catch (err: any) {
    // Database unavailable — NO enviar: sin verificación de último envío
    // un reinicio podría duplicar correos.
    console.error("[informes] could not query last send date:", err?.message || err);
    return { ok: false, day: null };
  }
}

async function logInformeSend(status: string, details: unknown): Promise<void> {
  try {
    await queryAudit(
      `INSERT INTO informe_send_log (status, details) VALUES ($1, $2)`,
      [status, JSON.stringify(details || {})],
    );
  } catch (err: any) {
    // Table is created by migration 009; if INSERT fails the DB is likely
    // unavailable. Log the error but don't crash the scheduler.
    console.error("[informes] could not log send:", err?.message || err);
  }
}

type ScheduledReport =
  | { type: "servers" | "rds" | "logs" | "vaults"; subject: string; html: string; text: string; total: number; dateLabel: string };

async function tick(): Promise<void> {
  try {
    if (!(await isSendGridConfigured())) return;

    const { hour, day } = getBogotaNow();
    // SOLO enviar dentro de la hora programada (07:00–07:59 Bogotá por defecto).
    // Un reinicio/redeploy del contenedor a cualquier otra hora NUNCA envía correos.
    if (hour !== getInformeScheduleHour()) return;

    // Dedup contra la BD: si el informe diario ya se envió hoy, no reenviar.
    // Si la BD no responde (ok=false), NO enviar (fail-safe anti-duplicados).
    const last = await getLastInformeSentDay();
    if (!last.ok) return;
    if (last.day === day) return;

    // Refresco previo: garantiza que el correo de las 07:00 lleve los datos
    // de ayer recién recolectados (la ventana de backups cierra a las 04:00).
    if (isBackupRefreshRunning()) {
      console.log("[informes] backup refresh in progress, retry next tick");
      return;
    }
    console.log(`[informes] scheduled backups refresh start (Bogota ${day})`);
    await refreshBackups("scheduled", "informe-scheduler");
    console.log(`[informes] scheduled backups refresh done (Bogota ${day})`);

    console.log(`[informes] scheduled send start (Bogota ${day})`);

    const reports: ScheduledReport[] = [];

    const servers = await generateInformeData();
    reports.push({
      type: "servers",
      subject: `Informe diario de backups de servidores — ${servers.dateLabel}`,
      html: generateEmailHtml(servers),
      text: generateEmailText(servers),
      total: servers.globalSummary.totalBackups,
      dateLabel: servers.dateLabel,
    });

    const rds = await generateRdsInformeData();
    reports.push({
      type: "rds",
      subject: `Informe diario de backups de bases de datos — ${rds.dateLabel}`,
      html: generateRdsEmailHtml(rds),
      text: generateRdsEmailText(rds),
      total: rds.globalSummary.expectedDatabases,
      dateLabel: rds.dateLabel,
    });

    const logs = await generateLogsInformeData();
    reports.push({
      type: "logs",
      subject: `Informe diario de backups de logs transaccionales — ${logs.dateLabel}`,
      html: generateLogsEmailHtml(logs),
      text: generateLogsEmailText(logs),
      total: logs.globalSummary.totalEntries,
      dateLabel: logs.dateLabel,
    });

    const vaults = await generateVaultsInformeData();
    reports.push({
      type: "vaults",
      subject: `Informe diario de capacidad de Vaults — Huawei Cloud — ${vaults.dateLabel}`,
      html: generateVaultsEmailHtml(vaults),
      text: generateVaultsEmailText(vaults),
      total: vaults.totalVaults,
      dateLabel: vaults.dateLabel,
    });

    let sent = 0;
    let skipped = 0;
    for (const report of reports) {
      if (report.total === 0) {
        console.log(`[informes] scheduled skip: sin datos (${report.subject})`);
        skipped++;
        continue;
      }
      // Get per-type recipients for this report type
      const effective = await getEffectiveRecipients(report.type as RecipientReportType);
      if (effective.emails.length === 0) {
        console.log(`[informes] scheduled skip: sin destinatarios para ${report.type}`);
        skipped++;
        continue;
      }
      const result = await sendEmail({
        to: effective.emails,
        subject: report.subject,
        html: report.html,
        text: report.text,
      });
      await logInformeSend(result.success ? "success" : "error", {
        reportType: report.type,
        messageId: result.messageId,
        recipients: effective.emails,
        total: report.total,
        dateLabel: report.dateLabel,
      });
      // Auditoría del envío de informe
      try {
        await recordSystemAuditEvent({
          action: `informe.send.${report.type}`,
          category: "system",
          result: result.success ? "success" : "error",
          statusCode: result.success ? 200 : 500,
          metadata: { reportType: report.type, recipients: effective.emails.length, total: report.total, dateLabel: report.dateLabel },
        });
      } catch { /* no bloquear el scheduler por fallo de auditoría */ }
      if (result.success) sent++;
    }

    // Marca el día como procesado aunque todo se haya omitido por falta de datos,
    // para no reintentar cada 5 minutos.
    await logInformeSend(sent > 0 ? "success" : "partial", {
      reportType: "daily",
      scheduled: true,
      sent,
      skipped,
    });

    console.log(`[informes] scheduled send done: ${sent} enviados, ${skipped} omitidos (sin datos)`);
  } catch (error) {
    console.error("[informes] scheduled send error:", error instanceof Error ? error.message : error);
    await logInformeSend("error", { error: error instanceof Error ? error.message : String(error) });
  }
}

export function startInformeScheduler(): void {
  if (globalThis.__mcInventoryInformeScheduler) return;
  globalThis.__mcInventoryInformeScheduler = true;
  // El scheduler SOLO evalúa cada 5 minutos: los envíos ocurren únicamente
  // dentro de la hora programada (07:00–07:59 Bogotá) y con dedup en BD.
  // No hay tick inmediato al arrancar: un reinicio/redeploy nunca envía correos.
  setInterval(tick, 5 * 60 * 1000).unref?.();
  // Informe de bases de datos: cada lunes a las 7 AM (Bogota)
  setInterval(tickDatabasesInforme, 5 * 60 * 1000).unref?.();
  console.log("[informes] scheduler started (daily 07:00, America/Bogota) + databases (Mondays 07:00)");
}

async function tickDatabasesInforme(): Promise<void> {
  try {
    if (!(await isSendGridConfigured())) return;

    const { hour, day, dow } = getBogotaNow();
    // Solo los lunes (dow=1) dentro de la hora programada (07:00–07:59).
    // Un reinicio/redeploy a cualquier otra hora NUNCA envía este informe.
    if (dow !== 1) return;
    if (hour !== getInformeScheduleHour()) return;

    // Dedup contra la BD (antes era una variable en memoria que se perdía en
    // cada reinicio del contenedor y reenviaba el informe una y otra vez).
    // Si la BD no responde, NO enviar (fail-safe).
    const last = await getLastInformeSentDay("databases");
    if (!last.ok) return;
    if (last.day === day) return;

    console.log(`[informes-databases] scheduled send start (Bogota ${day}, Monday)`);

    const data = await generateDatabasesInformeData();
    if (data.totalDatabases === 0) {
      console.log("[informes-databases] scheduled skip: sin datos");
      return;
    }

    const subject = `Informe de bases de datos — ${data.dateLabel}`;
    const html = generateDatabasesEmailHtml(data);
    const text = generateDatabasesEmailText(data);

    // Use effective recipients for RDS informe type (DB > env)
    const effective = await getEffectiveRecipients("rds");
    if (effective.emails.length === 0) {
      console.log("[informes-databases] no active recipients, skipping");
      return;
    }

    const result = await sendEmail({
      to: effective.emails,
      subject,
      html,
      text,
    });

    if (result.success) {
      console.log(`[informes-databases] scheduled send done: ${data.totalDatabases} bases de datos a ${effective.emails.join(", ")}`);
    } else {
      console.error("[informes-databases] scheduled send error: SendGrid failed");
    }

    // Auditoría
    try {
      await recordSystemAuditEvent({
        action: "informe.send.databases",
        category: "system",
        result: result.success ? "success" : "error",
        statusCode: result.success ? 200 : 500,
        metadata: { reportType: "databases", recipients: DB_INFORME_RECIPIENTS, total: data.totalDatabases, dateLabel: data.dateLabel, scheduled: true },
      });
    } catch { /* no bloquear */ }

    await logInformeSend(result.success ? "success" : "error", {
      reportType: "databases",
      recipients: DB_INFORME_RECIPIENTS,
      total: data.totalDatabases,
      dateLabel: data.dateLabel,
    });
  } catch (error) {
    console.error("[informes-databases] scheduled send error:", error instanceof Error ? error.message : error);
  }
}
