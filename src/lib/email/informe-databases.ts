import { queryAudit } from "@/lib/db/pool";
import { getBogotaNow } from "@/lib/backups/scheduler";

const UX_LOGO_SRC =
  "https://i0.wp.com/ux.technology/wp-content/uploads/2023/08/Logo-UX-Technology.png?fit=150%2C80&ssl=1";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (["running", "available", "active", "ok"].includes(s)) return "#10b981";
  if (["stopped", "inactive"].includes(s)) return "#6b7280";
  return "#f59e0b";
}

function updateStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "actualizada") return "#10b981";
  if (s === "patch disponible") return "#f59e0b";
  if (s === "fin de soporte") return "#ef4444";
  if (s === "evaluar upgrade mayor") return "#f97316";
  return "#6b7280";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export type DatabasesInformeData = {
  generatedAt: string;
  dateLabel: string;
  totalDatabases: number;
  awsCount: number;
  huaweiCount: number;
  runningCount: number;
  databases: DatabaseReportRow[];
};

export type DatabaseReportRow = {
  provider: string;
  accountName: string;
  dbName: string;
  engine: string;
  version: string;
  status: string;
  endpoint: string;
  latestPatch?: string;
  updateStatus?: string;
  updateObservation?: string;
};

export async function generateDatabasesInformeData(): Promise<DatabasesInformeData> {
  const { day } = getBogotaNow();
  const dateLabel = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  // Get database inventory from the inventory cache in DB or build from API
  // For the informe, we query the inventory data directly
  const res = await queryAudit<{
    provider: string;
    account_name: string;
    name: string;
    engine: string;
    engine_version: string;
    status: string;
    host: string;
    latest_patch: string;
    update_status: string;
    update_observation: string;
  }>(
    `SELECT provider, account_name, name, engine, engine_version, status, host, latest_patch, update_status, update_observation
     FROM database_inventory
     ORDER BY provider, account_name, name`,
  );

  // If the table doesn't exist yet, return empty
  const rows: DatabaseReportRow[] = (res.rows || []).map((r) => ({
    provider: r.provider || "N/A",
    accountName: r.account_name || "N/A",
    dbName: r.name || "N/A",
    engine: r.engine || "N/A",
    version: r.engine_version || "N/A",
    status: r.status || "N/A",
    endpoint: r.host || "N/A",
    latestPatch: r.latest_patch || "",
    updateStatus: r.update_status || "",
    updateObservation: r.update_observation || "",
  }));

  return {
    generatedAt: new Date().toISOString(),
    dateLabel,
    totalDatabases: rows.length,
    awsCount: rows.filter((r) => r.provider === "AWS").length,
    huaweiCount: rows.filter((r) => r.provider === "HUAWEI CLOUD").length,
    runningCount: rows.filter((r) => ["running", "available", "active", "ok"].includes(r.status.toLowerCase())).length,
    databases: rows,
  };
}

// Alternative: generate from InventoryItem[] (for manual send from UI)
export function generateDatabasesInformeFromItems(items: DatabaseReportRow[]): DatabasesInformeData {
  const dateLabel = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return {
    generatedAt: new Date().toISOString(),
    dateLabel,
    totalDatabases: items.length,
    awsCount: items.filter((r) => r.provider === "AWS").length,
    huaweiCount: items.filter((r) => r.provider === "HUAWEI CLOUD").length,
    runningCount: items.filter((r) => ["running", "available", "active", "ok"].includes(r.status.toLowerCase())).length,
    databases: items,
  };
}

export function generateDatabasesEmailHtml(data: DatabasesInformeData): string {
  const { databases, dateLabel, totalDatabases, awsCount, huaweiCount, runningCount } = data;

  // Group by account for per-account sections
  const byAccount = new Map<string, DatabaseReportRow[]>();
  for (const db of databases) {
    const key = `${db.provider}|${db.accountName}`;
    let list = byAccount.get(key);
    if (!list) { list = []; byAccount.set(key, list); }
    list.push(db);
  }

  // Summary table: account → count
  const summaryRows = [...byAccount.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dbs]) => {
      const [provider, account] = key.split("|");
      const running = dbs.filter(d => ["running", "available", "active", "ok"].includes(d.status.toLowerCase())).length;
      const needsPatch = dbs.filter(d => d.updateStatus === "Patch Disponible").length;
      const eol = dbs.filter(d => d.updateStatus === "Fin de Soporte").length;
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${esc(provider)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:500;color:#1f2937;">${esc(account)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;color:#1f2937;">${dbs.length}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;color:#10b981;">${running}</td>
        ${needsPatch > 0 ? `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;color:#f59e0b;">${needsPatch}</td>` : `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;color:#9ca3af;">0</td>`}
        ${eol > 0 ? `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;color:#ef4444;font-weight:600;">${eol}</td>` : `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;color:#9ca3af;">0</td>`}
      </tr>`;
    }).join("");

  // Per-account detail sections
  const accountSections = [...byAccount.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dbs]) => {
      const [provider, account] = key.split("|");
      const rows = dbs.map(db => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:500;color:#1f2937;">${esc(db.dbName)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;font-family:monospace;color:#0e7490;">${esc(db.engine)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:${statusColor(db.status)};font-weight:600;">${esc(db.status)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(db.endpoint)}">${esc(db.endpoint)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;font-family:monospace;color:#d97706;">${esc(db.version)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;font-family:monospace;color:#10b981;">${esc(db.latestPatch || "—")}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:600;color:${updateStatusColor(db.updateStatus || "")};">${esc(db.updateStatus || "—")}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(db.updateObservation || "")}">${esc(db.updateObservation || "")}</td>
        </tr>
      `).join("");

      return `
      <div style="margin-bottom:20px;">
        <div style="font-size:14px;font-weight:600;color:#1f2937;margin-bottom:8px;">${esc(account)} <span style="font-size:11px;color:#9ca3af;font-weight:400;">(${esc(provider)})</span></div>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f9fafb;">
              <th align="left" style="padding:6px 8px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Base de datos</th>
              <th align="left" style="padding:6px 8px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Motor</th>
              <th align="left" style="padding:6px 8px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Estado</th>
              <th align="left" style="padding:6px 8px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Endpoint</th>
              <th align="left" style="padding:6px 8px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Versión</th>
              <th align="left" style="padding:6px 8px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Último Patch</th>
              <th align="left" style="padding:6px 8px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Estado Act.</th>
              <th align="left" style="padding:6px 8px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Observación</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe de bases de datos — ${dateLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<!-- Header -->
<div style="background:#0f172a;padding:24px 32px;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td style="vertical-align:middle;width:1%;white-space:nowrap;padding-right:16px;">
        <img src="${UX_LOGO_SRC}" width="120" height="70" alt="UX Technology" style="display:block;border-radius:10px;" />
      </td>
      <td style="vertical-align:middle;">
        <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">MC Inventory</div>
        <div style="font-size:14px;color:#cbd5e1;margin-top:3px;">Informe de bases de datos</div>
      </td>
      <td align="right" style="vertical-align:middle;white-space:nowrap;">
        <div style="font-size:13px;color:#94a3b8;">${dateLabel}</div>
      </td>
    </tr>
  </table>
</div>

<!-- Title -->
<div style="padding:24px 32px 0;max-width:960px;margin:0 auto;">
  <div style="font-size:20px;font-weight:700;color:#1f2937;">Informe de bases de datos</div>
  <div style="font-size:13px;color:#6b7280;margin-top:4px;">${dateLabel}</div>
</div>

<!-- Summary cards -->
<div style="padding:16px 32px;max-width:960px;margin:0 auto;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      ${[
        { label: "Total", value: totalDatabases, color: "#7c3aed" },
        { label: "AWS", value: awsCount, color: "#f59e0b" },
        { label: "Huawei Cloud", value: huaweiCount, color: "#ef4444" },
        { label: "Disponibles", value: runningCount, color: "#10b981" },
      ].map((m) => `
        <td style="padding:0 6px;width:25%;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;border-left:4px solid ${m.color};">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:600;">${m.label}</div>
            <div style="font-size:24px;font-weight:700;color:#1f2937;margin-top:4px;">${m.value}</div>
          </div>
        </td>
      `).join("")}
    </tr>
  </table>
</div>

<!-- Summary by account -->
<div style="padding:0 32px 16px;max-width:960px;margin:0 auto;">
  <div style="font-size:15px;font-weight:600;color:#1f2937;margin-bottom:10px;">Resumen por cuenta</div>
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#f9fafb;">
          <th align="left" style="padding:6px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Provider</th>
          <th align="left" style="padding:6px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Cuenta</th>
          <th align="center" style="padding:6px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Total</th>
          <th align="center" style="padding:6px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Running</th>
          <th align="center" style="padding:6px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Patch Disp.</th>
          <th align="center" style="padding:6px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">EOL</th>
        </tr>
      </thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </div>
</div>

<!-- Detail by account -->
<div style="padding:0 32px 32px;max-width:960px;margin:0 auto;">
  <div style="font-size:15px;font-weight:600;color:#1f2937;margin-bottom:10px;">Detalle por cuenta</div>
  ${accountSections}
</div>

<!-- Footer -->
<div style="padding:16px 32px;border-top:1px solid #e5e7eb;">
  <div style="font-size:11px;color:#9ca3af;">UX Technology · MC Inventory · Informe automático</div>
</div>

</body>
</html>`;
}

export function generateDatabasesEmailText(data: DatabasesInformeData): string {
  const { databases, dateLabel, totalDatabases, awsCount, huaweiCount, runningCount } = data;
  let text = `INFORME DE BASES DE DATOS — ${dateLabel}\n`;
  text += `${"=".repeat(60)}\n\n`;
  text += `Total: ${totalDatabases} | AWS: ${awsCount} | Huawei: ${huaweiCount} | Disponibles: ${runningCount}\n\n`;
  text += `${"─".repeat(120)}\n`;
  text += `Provider         Cuenta                Base de datos                Motor              Versión        Estado         Endpoint\n`;
  text += `${"─".repeat(120)}\n`;
  for (const db of databases) {
    text += `${db.provider.padEnd(16)} ${db.accountName.padEnd(21)} ${db.dbName.slice(0, 28).padEnd(29)} ${db.engine.padEnd(18)} ${db.version.padEnd(14)} ${db.status.padEnd(14)} ${db.endpoint}\n`;
  }
  text += `${"─".repeat(120)}\n`;
  text += `\nUX Technology · MC Inventory\n`;
  return text;
}
