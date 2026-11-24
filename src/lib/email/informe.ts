import { queryAudit } from "@/lib/db/pool";
import {
  accountKey,
  getExpectedServers,
  getPreviousDayBogota,
  type Coverage,
  type DayWindow,
  type ExpectedResource,
} from "./compliance";

const UX_LOGO_SRC =
  "https://i0.wp.com/ux.technology/wp-content/uploads/2023/08/Logo-UX-Technology.png?fit=150%2C80&ssl=1";

export type ServerBackupDetail = {
  resourceName: string;
  resourceId: string;
  resourceType: string;
  region: string;
  vaultName: string;
  backupName: string;
  status: string;
  sizeBytes: number | null;
  backupCreatedAt: string | null;
  backupCompletedAt: string | null;
  backupExpiresAt: string | null;
  coverage: Coverage;
};

export type AccountDetail = {
  accountId: string;
  accountName: string;
  region: string;
  vaultCount: number;
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  inProgressBackups: number;
  expiredBackups: number;
  serversWithBackup: number;
  totalAllServers: number;
  excludedServers: number;
  excludedServerNames: string[];
  totalServers: number;
  missingServers: number;
  coveragePct: number;
  lastBackup: string | null;
  servers: ServerBackupDetail[];
};

export type ProviderReport = {
  provider: string;
  totalBackups: number;
  totalBytes: number;
  accounts: AccountDetail[];
  successfulTotal: number;
  failedTotal: number;
  inProgressTotal: number;
  expiredTotal: number;
  successRate: number;
  failureRate: number;
};

export type InformeData = {
  generatedAt: string;
  dateLabel: string;
  day: DayWindow;
  aws: ProviderReport;
  huawei: ProviderReport;
  globalSummary: {
    totalAllServers: number;
    excludedServers: number;
    excludedServerNames: string[];
    totalBackups: number;
    totalBytes: number;
    coveragePct: number;
    missingPct: number;
    expectedServers: number;
    coveredServers: number;
    missingServers: number;
  };
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatBogota(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (["COMPLETED", "AVAILABLE"].includes(s)) return "#10b981";
  if (["FAILED", "ERROR", "SIN BACKUP"].includes(s)) return "#ef4444";
  if (["IN_PROGRESS", "PROTECTING", "CREATING", "PARTIAL"].includes(s)) return "#f59e0b";
  if (["EXPIRED", "DELETING"].includes(s)) return "#71717a";
  return "#06b6d4";
}

function statusBg(status: string): string {
  const s = status.toUpperCase();
  if (["COMPLETED", "AVAILABLE"].includes(s)) return "#f0fdf4";
  if (["FAILED", "ERROR", "SIN BACKUP"].includes(s)) return "#fef2f2";
  if (["IN_PROGRESS", "PROTECTING", "CREATING", "PARTIAL"].includes(s)) return "#fffbeb";
  if (["EXPIRED", "DELETING"].includes(s)) return "#f9fafb";
  return "#f0f9ff";
}

type WindowBackupRow = {
  resource_name: string;
  resource_id: string;
  resource_type: string;
  vault_name: string;
  backup_name: string;
  status: string;
  size_bytes: number | null;
  backup_created_at: string | null;
  backup_completed_at: string | null;
  backup_expires_at: string | null;
};

function coverageOf(status: string): Coverage {
  const s = status.toUpperCase();
  if (["COMPLETED", "AVAILABLE"].includes(s)) return "OK";
  if (["FAILED", "ERROR"].includes(s)) return "FAILED";
  return "FAILED";
}

function toDetail(row: WindowBackupRow, coverage: Coverage, region?: string): ServerBackupDetail {
  return {
    resourceName: row.resource_name || row.resource_id,
    resourceId: row.resource_id,
    resourceType: row.resource_type || "",
    region: region || "",
    vaultName: row.vault_name || "",
    backupName: row.backup_name || "",
    status: coverage === "MISSING" ? "SIN BACKUP" : row.status,
    sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : null,
    backupCreatedAt: row.backup_created_at ? new Date(row.backup_created_at).toISOString() : null,
    backupCompletedAt: row.backup_completed_at ? new Date(row.backup_completed_at).toISOString() : null,
    backupExpiresAt: row.backup_expires_at ? new Date(row.backup_expires_at).toISOString() : null,
    coverage,
  };
}

function missingDetail(exp: ExpectedResource, region?: string): ServerBackupDetail {
  return {
    resourceName: exp.resourceName,
    resourceId: exp.resourceId,
    resourceType: "",
    region: region || "",
    vaultName: "",
    backupName: "",
    status: "SIN BACKUP",
    sizeBytes: null,
    backupCreatedAt: null,
    backupCompletedAt: null,
    backupExpiresAt: null,
    coverage: "MISSING",
  };
}

/**
 * Informe de cumplimiento del DÍA ANTERIOR (America/Bogota):
 * cruza el inventario (servidores esperados) con los backups generados
 * en la ventana [00:00, 24:00) de ayer. Lo que no tiene backup sale en rojo.
 */
export async function generateInformeData(day?: DayWindow): Promise<InformeData> {
  const target = day || getPreviousDayBogota();
  const now = new Date();
  const allExpected = await getExpectedServers();
  const totalAllServers = allExpected.length;
  let excludedServers = 0;
  let excludedServerNames: string[] = [];
  let expected = allExpected;

  // Exclude volatile/temporary servers (Jenkins slaves, etc.) from exceptions list
  try {
    const { filterExcludedServers } = await import("@/lib/email/exceptions");
    const { included, excludedNames } = await filterExcludedServers(expected, (e) => e.resourceName);
    if (excludedNames.length > 0) {
      console.log(`[informe] excluded ${excludedNames.length} volatile servers: ${excludedNames.slice(0, 5).join(", ")}${excludedNames.length > 5 ? "..." : ""}`);
    }
    excludedServers = excludedNames.length;
    excludedServerNames = excludedNames;
    expected = included;
  } catch { /* ignore if exceptions table doesn't exist yet */ }

  const byAccount = new Map<string, { provider: string; accountId: string; accountName: string; region: string; expected: ExpectedResource[] }>();
  for (const exp of expected) {
    const key = accountKey(exp.provider, exp.accountId, exp.region);
    let entry = byAccount.get(key);
    if (!entry) {
      entry = { provider: exp.provider, accountId: exp.accountId, accountName: exp.accountName, region: exp.region || "", expected: [] };
      byAccount.set(key, entry);
    }
    entry.expected.push(exp);
  }

  const windowRows = await queryAudit<WindowBackupRow & { provider: string; account_id: string; account_name: string; region: string }>(
    `SELECT provider, account_id, account_name, region, resource_name, resource_id, resource_type, vault_name, backup_name, status, size_bytes, backup_created_at, backup_completed_at, backup_expires_at
     FROM server_backups
     WHERE backup_created_at >= $1 AND backup_created_at < $2
     ORDER BY provider, account_id, resource_id, backup_created_at DESC`,
    [target.startISO, target.endISO],
  );

  const windowByAccount = new Map<string, typeof windowRows.rows>();
  for (const row of windowRows.rows) {
    const key = accountKey(row.provider, row.account_id, row.region);
    const list = windowByAccount.get(key);
    if (list) list.push(row);
    else windowByAccount.set(key, [row]);
  }

  // Cuentas con backups en ventana pero sin inventario (p. ej. caché vacío): igual se reportan.
  for (const [key, rows] of windowByAccount) {
    if (!byAccount.has(key) && rows.length > 0) {
      const first = rows[0];
      byAccount.set(key, {
        provider: first.provider,
        accountId: first.account_id,
        accountName: first.account_name || "N/A",
        region: first.region || "",
        expected: [],
      });
    }
  }

  async function buildProviderReport(provider: "AWS" | "HUAWEI CLOUD"): Promise<ProviderReport> {
    const providerEntries = [...byAccount.values()].filter((a) => a.provider === provider);

    const accounts = providerEntries.map((acc) => {
      const rows = windowByAccount.get(accountKey(acc.provider, acc.accountId, acc.region)) || [];
      const latestByResource = new Map<string, WindowBackupRow>();
      for (const r of rows) {
        if (!latestByResource.has(r.resource_id)) latestByResource.set(r.resource_id, r);
      }

      const seen = new Set<string>();
      const servers: ServerBackupDetail[] = [];
      let ok = 0;
      let failed = 0;
      let missing = 0;
      let bytes = 0;
      const vaults = new Set<string>();
      let last: string | null = null;

      for (const exp of acc.expected) {
        const rec = latestByResource.get(exp.resourceId);
        if (!rec) {
          // Fallback por nombre (IDs difieren entre nubes en casos borde).
          const byName = [...latestByResource.values()].find(
            (r) => (r.resource_name || "").toLowerCase() === exp.resourceName.toLowerCase(),
          );
          if (!byName) {
            servers.push(missingDetail(exp, acc.region));
            missing++;
            continue;
          }
          seen.add(byName.resource_id);
          const cov = coverageOf(byName.status);
          servers.push(toDetail(byName, cov, acc.region));
          if (cov === "OK") { ok++; bytes += Number(byName.size_bytes || 0); }
          else failed++;
          if (byName.vault_name) vaults.add(byName.vault_name);
          if (byName.backup_created_at && (!last || byName.backup_created_at > last)) last = byName.backup_created_at;
          continue;
        }
        seen.add(rec.resource_id);
        const cov = coverageOf(rec.status);
        servers.push(toDetail(rec, cov, acc.region));
        if (cov === "OK") { ok++; bytes += Number(rec.size_bytes || 0); }
        else failed++;
        if (rec.vault_name) vaults.add(rec.vault_name);
        if (rec.backup_created_at && (!last || rec.backup_created_at > last)) last = rec.backup_created_at;
      }

      // Backups huérfanos (recurso ya no está en inventario): se listan igual.
      for (const [rid, rec] of latestByResource) {
        if (seen.has(rid)) continue;
        const cov = coverageOf(rec.status);
        servers.push(toDetail(rec, cov, acc.region));
        if (cov === "OK") bytes += Number(rec.size_bytes || 0);
        if (rec.vault_name) vaults.add(rec.vault_name);
      }

      servers.sort((a, b) => {
        const rank = (c: Coverage) => (c === "MISSING" ? 0 : c === "FAILED" ? 1 : 2);
        return rank(a.coverage) - rank(b.coverage) || a.resourceName.localeCompare(b.resourceName);
      });

      const totalServers = acc.expected.length;
      const inProgress = rows.filter((r) =>
        ["IN_PROGRESS", "PROTECTING", "CREATING", "PARTIAL"].includes((r.status || "").toUpperCase()),
      ).length;
      const expired = rows.filter((r) =>
        ["EXPIRED", "DELETING"].includes((r.status || "").toUpperCase()),
      ).length;

      return {
        accountId: acc.accountId,
        accountName: acc.accountName,
        region: rows[0]?.region || "",
        vaultCount: vaults.size,
        totalBackups: rows.length,
        successfulBackups: ok,
        failedBackups: failed,
        inProgressBackups: inProgress,
        expiredBackups: expired,
        serversWithBackup: ok,
        totalAllServers: totalServers,
        excludedServers: 0,
        excludedServerNames: [],
        totalServers,
        missingServers: missing,
        coveragePct: totalServers ? Math.round((ok / totalServers) * 100) : 0,
        lastBackup: last ? new Date(last).toISOString() : null,
        servers,
      };
    });

    const totalBackups = accounts.reduce((a, c) => a + c.totalBackups, 0);
    const successfulTotal = accounts.reduce((a, c) => a + c.successfulBackups, 0);
    const failedTotal = accounts.reduce((a, c) => a + c.failedBackups, 0);
    const inProgressTotal = accounts.reduce((a, c) => a + c.inProgressBackups, 0);
    const expiredTotal = accounts.reduce((a, c) => a + c.expiredBackups, 0);
    const totalBytes = accounts.reduce(
      (a, c) => a + c.servers.filter((s) => s.coverage === "OK").reduce((x, s) => x + (s.sizeBytes || 0), 0),
      0,
    );

    // Vault capacity removed from servers informe — now a separate email

    return {
      provider: provider === "AWS" ? "AWS" : "Huawei Cloud",
      totalBackups,
      totalBytes,
      accounts,
      successfulTotal,
      failedTotal,
      inProgressTotal,
      expiredTotal,
      successRate: accounts.reduce((a, c) => a + c.totalServers, 0) ? Math.round((accounts.reduce((a, c) => a + c.serversWithBackup, 0) / accounts.reduce((a, c) => a + c.totalServers, 0)) * 100) : 0,
      failureRate: accounts.reduce((a, c) => a + c.totalServers, 0) ? Math.round((accounts.reduce((a, c) => a + c.missingServers, 0) / accounts.reduce((a, c) => a + c.totalServers, 0)) * 100) : 0,
    };
  }

  const aws = await buildProviderReport("AWS");
  const huawei = await buildProviderReport("HUAWEI CLOUD");

  const expectedServers = expected.length;
  const coveredServers =
    aws.accounts.reduce((a, c) => a + c.serversWithBackup, 0) +
    huawei.accounts.reduce((a, c) => a + c.serversWithBackup, 0);
  const missingServers = expectedServers - coveredServers;
  const globalTotal = aws.totalBackups + huawei.totalBackups;
  const globalOk = aws.successfulTotal + huawei.successfulTotal;
  const globalFailed = aws.failedTotal + huawei.failedTotal;
  const globalBytes = aws.totalBytes + huawei.totalBytes;

  return {
    generatedAt: now.toISOString(),
    dateLabel: target.label,
    day: target,
    aws,
    huawei,
    globalSummary: {
      totalAllServers,
      excludedServers,
      excludedServerNames,
      totalBackups: globalTotal,
      totalBytes: globalBytes,
      coveragePct: expectedServers ? Math.round((coveredServers / expectedServers) * 100) : 0,
      missingPct: expectedServers ? Math.round((Math.max(0, missingServers) / expectedServers) * 100) : 0,
      expectedServers,
      coveredServers,
      missingServers: Math.max(0, missingServers),
    },
  };
}

function providerAccent(provider: string): string {
  return provider === "AWS" ? "#f59e0b" : "#dc2626";
}

function providerGradient(provider: string): string {
  return provider === "AWS"
    ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
    : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)";
}

function renderProviderSection(report: ProviderReport): string {
  const accent = providerAccent(report.provider);
  const gradient = providerGradient(report.provider);
  const providerLabel = report.provider === "AWS" ? "AWS" : "Huawei Cloud";

  const accountSections = report.accounts
    .map((acc) => {
      const serverRows = acc.servers
        .map((s) => {
          const sc = statusColor(s.status);
          const sb = statusBg(s.status);
          const rowBg = s.coverage === "MISSING" ? "background:#fef2f2;" : "";
          return `<tr style="${rowBg}">
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:500;color:#1f2937;">${esc(s.resourceName)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${esc(s.resourceType)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${esc(s.region)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${esc(s.vaultName)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:${sc};background:${sb};${s.coverage === "MISSING" ? "border:1px solid #ef4444;" : ""}">${esc(s.status)}</span></td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;white-space:nowrap;">${formatDateShort(s.backupCreatedAt)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:right;white-space:nowrap;">${s.sizeBytes !== null ? formatBytes(s.sizeBytes) : "—"}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;white-space:nowrap;">${formatDateShort(s.backupExpiresAt)}</td>
          </tr>`;
        })
        .join("");

      const missingBanner = acc.missingServers > 0
        ? `<p style="font-size:12px;font-weight:600;color:#ef4444;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;margin:0 0 12px;">⚠ ${acc.missingServers} servidor(es) SIN BACKUP en esta cuenta</p>`
        : "";

      // Total = total instances in account (expected), Fallidos = failed + missing (SIN BACKUP = fallido)
      const totalInstances = acc.totalServers;
      const exitosos = acc.successfulBackups;
      const fallidos = acc.failedBackups + acc.missingServers;
      const coberturaPct = totalInstances ? Math.round((exitosos / totalInstances) * 100) : 0;

      return `
      <div style="margin-bottom:24px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
          <tr>
            <td style="font-size:15px;font-weight:600;color:#1f2937;">${esc(acc.accountName)}</td>
            <td align="right" style="font-size:12px;color:#9ca3af;">${esc(acc.accountId)} · ${esc(acc.region)}</td>
          </tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">
          <tr>
            <td width="25%" style="padding:10px 12px;background:#f9fafb;border-radius:6px 0 0 6px;border-right:1px solid #e5e7eb;">
              <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Total</div>
              <div style="font-size:20px;font-weight:700;color:#1f2937;margin-top:2px;">${totalInstances}</div>
            </td>
            <td width="25%" style="padding:10px 12px;background:#f9fafb;border-right:1px solid #e5e7eb;">
              <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Exitosos</div>
              <div style="font-size:20px;font-weight:700;color:#10b981;margin-top:2px;">${exitosos}</div>
            </td>
            <td width="25%" style="padding:10px 12px;background:#f9fafb;border-right:1px solid #e5e7eb;">
              <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Fallidos</div>
              <div style="font-size:20px;font-weight:700;color:#ef4444;margin-top:2px;">${fallidos}</div>
            </td>
            <td width="25%" style="padding:10px 12px;background:#f9fafb;border-radius:0 6px 6px 0;">
              <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Cobertura</div>
              <div style="font-size:20px;font-weight:700;color:#1f2937;margin-top:2px;">${coberturaPct}%</div>
            </td>
          </tr>
        </table>
        ${missingBanner}
        ${acc.servers.length > 0 ? `
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f9fafb;">
              <th align="left" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Servidor</th>
              <th align="left" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Tipo</th>
              <th align="left" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Región</th>
              <th align="left" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Vault</th>
              <th align="left" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Estado</th>
              <th align="left" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Fecha</th>
              <th align="right" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Tamaño</th>
              <th align="left" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Expira</th>
            </tr>
          </thead>
          <tbody>${serverRows}</tbody>
        </table>
        ` : `<p style="font-size:13px;color:#9ca3af;margin:0;">Sin backups registrados.</p>`}
      </div>`;
    })
    .join("");

  return `
  <div style="margin-bottom:32px;">
    <div style="background:${gradient};padding:16px 20px;border-radius:10px 10px 0 0;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td>
            <span style="font-size:18px;font-weight:700;color:#ffffff;">${providerLabel}</span>
            <span style="font-size:13px;color:rgba(255,255,255,0.8);margin-left:12px;">${report.accounts.length} cuenta(s) · ${report.totalBackups} backups · ${formatBytes(report.totalBytes)}</span>
          </td>
          <td align="right">
            <span style="display:inline-block;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;color:#ffffff;background:rgba(255,255,255,0.2);">Cobertura: ${report.successRate}%</span>
          </td>
        </tr>
      </table>
    </div>
    <div style="padding:20px;background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
      ${accountSections}
    </div>
  </div>`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateEmailHtml(data: InformeData): string {
  const { aws, huawei, globalSummary, dateLabel } = data;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe diario de backups — ${esc(dateLabel)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<center style="width:100%;padding:24px 0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:960px;width:100%;margin:0 auto;">

  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:24px 32px;border-radius:12px 12px 0 0;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="vertical-align:middle;width:1%;white-space:nowrap;padding-right:16px;">
            <img src="${UX_LOGO_SRC}" alt="UX Technology" width="120" height="70" style="display:block;border-radius:10px;">
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">MC Inventory</div>
            <div style="font-size:14px;color:#cbd5e1;margin-top:3px;">Informe diario de backups de servidores</div>
          </td>
          <td align="right" style="vertical-align:middle;white-space:nowrap;">
            <div style="font-size:13px;color:#94a3b8;">${esc(dateLabel)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="background:#ffffff;padding:24px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <div style="font-size:16px;font-weight:600;color:#1f2937;margin-bottom:6px;">Resumen ejecutivo — día anterior</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:16px;">Cobertura: ${globalSummary.coveredServers}/${globalSummary.expectedServers} servidores con backup exitoso (${globalSummary.coveragePct}%)</div>
      ${globalSummary.missingServers > 0 ? `<div style="font-size:13px;font-weight:700;color:#ffffff;background:#ef4444;border-radius:8px;padding:12px 16px;margin-bottom:16px;">⚠ ${globalSummary.missingServers} SERVIDOR(ES) SIN BACKUP — revisar detalle en rojo</div>` : `<div style="font-size:13px;font-weight:600;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">✓ Todos los servidores tienen backup del día anterior</div>`}
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="16%" style="padding:12px 14px;background:#f9fafb;border-radius:8px 0 0 0;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Total servidores</div>
            <div style="font-size:24px;font-weight:700;color:#1f2937;margin-top:4px;">${globalSummary.totalAllServers}</div>
          </td>
          <td width="16%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;">Excepciones</div>
            <div style="font-size:24px;font-weight:700;color:#f59e0b;margin-top:4px;">${globalSummary.excludedServers}</div>
          </td>
          <td width="16%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">En plan</div>
            <div style="font-size:24px;font-weight:700;color:#1f2937;margin-top:4px;">${globalSummary.expectedServers}</div>
          </td>
          <td width="16%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Exitosos</div>
            <div style="font-size:24px;font-weight:700;color:#10b981;margin-top:4px;">${globalSummary.coveredServers}</div>
          </td>
          <td width="16%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Fallidos</div>
            <div style="font-size:24px;font-weight:700;color:#ef4444;margin-top:4px;">${globalSummary.missingServers}</div>
          </td>
          <td width="16%" style="padding:12px 14px;background:#f9fafb;border-radius:0 8px 0 0;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Cobertura</div>
            <div style="font-size:24px;font-weight:700;color:#10b981;margin-top:4px;">${globalSummary.coveragePct}%</div>
          </td>
        </tr>
        <tr>
          <td colspan="6" style="padding:12px 14px;background:#f9fafb;border-radius:0 0 8px 8px;border-top:1px solid #e5e7eb;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="33%" style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Total backups</td>
                <td width="34%" style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Volumen total</td>
                <td width="33%" style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="font-size:18px;font-weight:700;color:#6b7280;">${globalSummary.totalBackups}</td>
                <td style="font-size:18px;font-weight:700;color:#6b7280;">${formatBytes(globalSummary.totalBytes)}</td>
                <td>&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="background:#ffffff;padding:24px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      ${renderProviderSection(aws)}
      ${renderProviderSection(huawei)}
    </td>
  </tr>

  ${globalSummary.excludedServerNames && globalSummary.excludedServerNames.length > 0 ? `
  <tr>
    <td style="background:#fffbeb;padding:16px 32px;border-left:1px solid #fde68a;border-right:1px solid #fde68a;border-top:1px solid #fde68a;">
      <div style="font-size:13px;font-weight:600;color:#92400e;margin-bottom:8px;">⚠ Servidores en excepciones (${globalSummary.excludedServers})</div>
      <div style="font-size:12px;color:#78350f;line-height:1.6;">${globalSummary.excludedServerNames.map(n => `<span style="display:inline-block;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:2px 8px;margin:2px 4px;font-size:11px;">${esc(n)}</span>`).join("")}</div>
    </td>
  </tr>
  ` : ""}

  <tr>
    <td bgcolor="#1e293b" style="background:#1e293b;padding:20px 32px;border-radius:0 0 12px 12px;text-align:center;">
      <div style="font-size:13px;color:#94a3b8;">UX Technology · MC Inventory</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px;">Informe generado automáticamente · ${esc(dateLabel)}</div>
    </td>
  </tr>

</table>
</center>
</body>
</html>`;
}

export function generateEmailText(data: InformeData): string {
  const { aws, huawei, globalSummary, dateLabel } = data;

  const lines: string[] = [];
  lines.push("MC Inventory — Informe diario de backups (día anterior)");
  lines.push(dateLabel);
  lines.push("");
  lines.push("=== RESUMEN EJECUTIVO ===");
  lines.push(`Total backups: ${globalSummary.totalBackups}`);
  lines.push(`Volumen total: ${formatBytes(globalSummary.totalBytes)}`);
  lines.push(`Cobertura: ${globalSummary.coveragePct}%`);
  lines.push(`Faltantes: ${globalSummary.missingPct}%`);
  lines.push(`Cobertura: ${globalSummary.coveredServers}/${globalSummary.expectedServers} servidores (${globalSummary.coveragePct}%)`);
  if (globalSummary.missingServers > 0) {
    lines.push(`!!! ${globalSummary.missingServers} SERVIDOR(ES) SIN BACKUP !!!`);
  }
  lines.push("");

  function renderProvider(report: ProviderReport) {
    lines.push(`=== ${report.provider.toUpperCase()} ===`);
    lines.push(`Backups: ${report.totalBackups} | Volumen: ${formatBytes(report.totalBytes)} | Cobertura: ${report.successRate}%`);
    lines.push("");
    for (const acc of report.accounts) {
      const coverage = acc.totalServers ? Math.round((acc.serversWithBackup / acc.totalServers) * 100) : 0;
      lines.push(`-- ${acc.accountName} (${acc.accountId}) — ${acc.region} --`);
      lines.push(`  Total: ${acc.totalBackups} | Exitosos: ${acc.successfulBackups} | Fallidos: ${acc.failedBackups} | Sin backup: ${acc.missingServers} | Cobertura: ${coverage}%`);
      lines.push("");
      for (const s of acc.servers) {
        const flag = s.coverage === "MISSING" ? "[SIN BACKUP] " : s.coverage === "FAILED" ? "[FALLIDO] " : "";
        const size = s.sizeBytes !== null ? formatBytes(s.sizeBytes) : "—";
        lines.push(`  ${flag}${s.resourceName} [${s.resourceType}] [${s.region}]`);
        lines.push(`    Vault: ${s.vaultName || "—"} | Estado: ${s.status} | Fecha: ${formatDateShort(s.backupCreatedAt)} | Tamaño: ${size} | Expira: ${formatDateShort(s.backupExpiresAt)}`);
      }
      lines.push("");
    }
  }

  renderProvider(aws);
  renderProvider(huawei);

  lines.push("—");
  lines.push("UX Technology · MC Inventory");
  lines.push("Informe generado automáticamente");

  return lines.join("\n");
}

/**
 * Recorta el informe a un solo proveedor y recalcula el resumen global,
 * para que "Enviar informe AWS/Huawei" contenga solo esa nube.
 */
export function filterInformeData(data: InformeData, provider: "AWS" | "HUAWEI CLOUD"): InformeData {
  const keep = provider === "AWS" ? data.aws : data.huawei;
  const empty: ProviderReport = {
    provider: provider === "AWS" ? "Huawei Cloud" : "AWS",
    totalBackups: 0,
    totalBytes: 0,
    accounts: [],
    successfulTotal: 0,
    failedTotal: 0,
    inProgressTotal: 0,
    expiredTotal: 0,
    successRate: 0,
    failureRate: 0,
  };
  const aws = provider === "AWS" ? keep : empty;
  const huawei = provider === "HUAWEI CLOUD" ? keep : empty;
  const total = keep.totalBackups;
  const covered = keep.accounts.reduce((a, c) => a + c.serversWithBackup, 0);
  const expectedCount = keep.accounts.reduce((a, c) => a + c.totalServers, 0);
  const missing = Math.max(0, expectedCount - covered);
  return {
    ...data,
    aws,
    huawei,
    globalSummary: {
      totalAllServers: data.globalSummary.totalAllServers,
      excludedServers: data.globalSummary.excludedServers,
      excludedServerNames: data.globalSummary.excludedServerNames || [],
      totalBackups: total,
      totalBytes: keep.totalBytes,
      coveragePct: expectedCount ? Math.round((covered / expectedCount) * 100) : 0,
      missingPct: expectedCount ? Math.round((missing / expectedCount) * 100) : 0,
      expectedServers: expectedCount,
      coveredServers: covered,
      missingServers: missing,
    },
  };
}
