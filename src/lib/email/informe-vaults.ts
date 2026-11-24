/**
 * Informe diario de capacidad de Vaults — Huawei Cloud CBR
 * Correo independiente enviado a las 7 AM con el estado de uso de los vaults.
 * AWS no se configura ni se tiene en cuenta (solo Huawei Cloud).
 */

import { queryAudit } from "@/lib/db/pool";
import { getPreviousDayBogota } from "@/lib/email/compliance";
import type { DayWindow } from "@/lib/email/compliance";

const UX_LOGO_SRC =
  "https://i0.wp.com/ux.technology/wp-content/uploads/2023/08/Logo-UX-Technology.png?fit=150%2C80&ssl=1";

// ── Types ──

export type VaultEntry = {
  accountName: string;
  accountId: string;
  region: string;
  vaultName: string;
  vaultId: string;
  usedGB: string;
  capacityGB: string;
  usedPercent: number;
  usedPercentStr: string;
};

export type VaultAccountSummary = {
  accountName: string;
  accountId: string;
  region: string;
  vaultCount: number;
  totalUsedGB: number;
  totalCapacityGB: number;
  avgUsedPercent: number;
  vaults: VaultEntry[];
};

export type VaultsInformeData = {
  generatedAt: string;
  dateLabel: string;
  day: DayWindow;
  totalVaults: number;
  totalUsedGB: number;
  totalCapacityGB: number;
  avgUsedPercent: number;
  criticalVaults: number;  // >= 90%
  warningVaults: number;   // >= 70%
  healthyVaults: number;   // < 70%
  accounts: VaultAccountSummary[];
};

// ── Helpers ──

function formatGB(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Data generation ──

export async function generateVaultsInformeData(day?: DayWindow): Promise<VaultsInformeData> {
  const target = day || getPreviousDayBogota();
  const now = new Date();

  const res = await queryAudit<{
    account_name: string;
    account_id: string;
    region: string;
    vault_name: string;
    vault_id: string;
    used_bytes: string;
    capacity_bytes: string;
    used_percent: string;
  }>(
    `SELECT account_name, account_id, region, vault_name, vault_id, used_bytes, capacity_bytes, used_percent
     FROM vault_capacity
     WHERE provider = 'HUAWEI CLOUD'
     ORDER BY account_name, vault_name`,
  );

  // Group by account
  const byAccount = new Map<string, VaultEntry[]>();
  for (const r of res.rows) {
    const key = `${r.account_id}`;
    if (!byAccount.has(key)) byAccount.set(key, []);
    const usedBytes = Number(r.used_bytes || 0);
    const capacityBytes = Number(r.capacity_bytes || 0);
    const pct = Number(r.used_percent || 0);
    byAccount.get(key)!.push({
      accountName: r.account_name,
      accountId: r.account_id,
      region: r.region,
      vaultName: r.vault_name,
      vaultId: r.vault_id,
      usedGB: formatGB(usedBytes),
      capacityGB: formatGB(capacityBytes),
      usedPercent: pct,
      usedPercentStr: `${pct.toFixed(1)}%`,
    });
  }

  const accounts: VaultAccountSummary[] = [];
  let totalVaults = 0;
  let totalUsedGB = 0;
  let totalCapacityGB = 0;
  let criticalVaults = 0;
  let warningVaults = 0;
  let healthyVaults = 0;

  for (const [accountId, vaults] of byAccount) {
    const acctUsedGB = vaults.reduce((a, v) => a + v.usedPercent, 0) > 0
      ? vaults.reduce((a, v) => {
          // Parse usedGB back to number for aggregation
          const usedStr = v.usedGB;
          const match = usedStr.match(/([\d.]+)\s*(TB|GB)/);
          if (!match) return a;
          const val = parseFloat(match[1]);
          return a + (match[2] === "TB" ? val * 1024 : val);
        }, 0)
      : 0;
    const acctCapacityGB = vaults.reduce((a, v) => {
      const capStr = v.capacityGB;
      const match = capStr.match(/([\d.]+)\s*(TB|GB)/);
      if (!match) return a;
      const val = parseFloat(match[1]);
      return a + (match[2] === "TB" ? val * 1024 : val);
    }, 0);
    const avgPct = vaults.length ? Math.round(vaults.reduce((a, v) => a + v.usedPercent, 0) / vaults.length) : 0;

    accounts.push({
      accountName: vaults[0].accountName,
      accountId,
      region: vaults[0].region,
      vaultCount: vaults.length,
      totalUsedGB: Math.round(acctUsedGB * 10) / 10,
      totalCapacityGB: Math.round(acctCapacityGB * 10) / 10,
      avgUsedPercent: avgPct,
      vaults,
    });

    totalVaults += vaults.length;
    totalUsedGB += acctUsedGB;
    totalCapacityGB += acctCapacityGB;
    for (const v of vaults) {
      if (v.usedPercent >= 90) criticalVaults++;
      else if (v.usedPercent >= 70) warningVaults++;
      else healthyVaults++;
    }
  }

  // Sort accounts A-Z
  accounts.sort((a, b) => a.accountName.localeCompare(b.accountName));

  const avgUsedPercent = totalVaults
    ? Math.round(accounts.reduce((a, c) => a + c.avgUsedPercent * c.vaultCount, 0) / totalVaults)
    : 0;

  return {
    generatedAt: now.toISOString(),
    dateLabel: target.label,
    day: target,
    totalVaults,
    totalUsedGB: Math.round(totalUsedGB * 10) / 10,
    totalCapacityGB: Math.round(totalCapacityGB * 10) / 10,
    avgUsedPercent,
    criticalVaults,
    warningVaults,
    healthyVaults,
    accounts,
  };
}

// ── Email HTML ──

export function generateVaultsEmailHtml(data: VaultsInformeData): string {
  const { accounts, totalVaults, totalUsedGB, totalCapacityGB, avgUsedPercent, criticalVaults, warningVaults, healthyVaults, dateLabel } = data;

  const accountSections = accounts.map((acct) => {
    const vaultRows = acct.vaults.map((v) => {
      const pctColor = v.usedPercent >= 90 ? "#ef4444" : v.usedPercent >= 70 ? "#f59e0b" : "#10b981";
      const rowBg = v.usedPercent >= 90 ? "background:#fef2f2;" : v.usedPercent >= 70 ? "background:#fffbeb;" : "";
      return `<tr style="${rowBg}">
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:500;color:#1f2937;">${esc(v.vaultName)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:right;white-space:nowrap;">${v.usedGB}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:right;white-space:nowrap;">${v.capacityGB}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600;text-align:right;white-space:nowrap;color:${pctColor};">${v.usedPercentStr}</td>
      </tr>`;
    }).join("");

    const acctPctColor = acct.avgUsedPercent >= 90 ? "#ef4444" : acct.avgUsedPercent >= 70 ? "#f59e0b" : "#10b981";

    return `
    <div style="margin-bottom:24px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
        <tr>
          <td style="font-size:15px;font-weight:600;color:#1f2937;">${esc(acct.accountName)}</td>
          <td align="right" style="font-size:12px;color:#9ca3af;">${esc(acct.accountId)} · ${esc(acct.region)}</td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">
        <tr>
          <td width="25%" style="padding:10px 12px;background:#f9fafb;border-radius:6px 0 0 6px;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Vaults</div>
            <div style="font-size:20px;font-weight:700;color:#1f2937;margin-top:2px;">${acct.vaultCount}</div>
          </td>
          <td width="25%" style="padding:10px 12px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Used Capacity</div>
            <div style="font-size:20px;font-weight:700;color:#1f2937;margin-top:2px;">${acct.totalUsedGB} GB</div>
          </td>
          <td width="25%" style="padding:10px 12px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Vault Capacity</div>
            <div style="font-size:20px;font-weight:700;color:#1f2937;margin-top:2px;">${acct.totalCapacityGB} GB</div>
          </td>
          <td width="25%" style="padding:10px 12px;background:#f9fafb;border-radius:0 6px 6px 0;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Used Capacity %</div>
            <div style="font-size:20px;font-weight:700;color:${acctPctColor};margin-top:2px;">${acct.avgUsedPercent}%</div>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th align="left" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Vault</th>
            <th align="right" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Used Capacity (GB)</th>
            <th align="right" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Vault Capacity (GB)</th>
            <th align="right" style="padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Used Capacity %</th>
          </tr>
        </thead>
        <tbody>${vaultRows}</tbody>
      </table>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe diario de capacidad de Vaults — ${esc(dateLabel)}</title>
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
            <div style="font-size:14px;color:#cbd5e1;margin-top:3px;">Informe diario de capacidad de Vaults — Huawei Cloud</div>
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
      <div style="font-size:16px;font-weight:600;color:#1f2937;margin-bottom:6px;">Resumen ejecutivo — Huawei Cloud CBR</div>
      ${criticalVaults > 0 ? `<div style="font-size:13px;font-weight:700;color:#ffffff;background:#ef4444;border-radius:8px;padding:12px 16px;margin-bottom:16px;">⚠ ${criticalVaults} vault(s) con uso ≥ 90% — riesgo crítico</div>` : ""}
      ${warningVaults > 0 ? `<div style="font-size:13px;font-weight:600;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:16px;">⚡ ${warningVaults} vault(s) con uso ≥ 70% — atención requerida</div>` : ""}
      ${criticalVaults === 0 && warningVaults === 0 ? `<div style="font-size:13px;font-weight:600;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">✓ Todos los vaults con uso menor al 70%</div>` : ""}
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="20%" style="padding:12px 14px;background:#f9fafb;border-radius:8px 0 0 0;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Total vaults</div>
            <div style="font-size:24px;font-weight:700;color:#1f2937;margin-top:4px;">${totalVaults}</div>
          </td>
          <td width="20%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#ef4444;text-transform:uppercase;letter-spacing:0.5px;">Críticos (≥90%)</div>
            <div style="font-size:24px;font-weight:700;color:#ef4444;margin-top:4px;">${criticalVaults}</div>
          </td>
          <td width="20%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;">Alerta (≥70%)</div>
            <div style="font-size:24px;font-weight:700;color:#f59e0b;margin-top:4px;">${warningVaults}</div>
          </td>
          <td width="20%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.5px;">Sanos (&lt;70%)</div>
            <div style="font-size:24px;font-weight:700;color:#10b981;margin-top:4px;">${healthyVaults}</div>
          </td>
          <td width="20%" style="padding:12px 14px;background:#f9fafb;border-radius:0 8px 0 0;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Used Capacity %</div>
            <div style="font-size:24px;font-weight:700;color:#1f2937;margin-top:4px;">${avgUsedPercent}%</div>
          </td>
        </tr>
        <tr>
          <td colspan="5" style="padding:12px 14px;background:#f9fafb;border-radius:0 0 8px 8px;border-top:1px solid #e5e7eb;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="50%" style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Total usado</td>
                <td width="50%" style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Total capacidad</td>
              </tr>
              <tr>
                <td style="font-size:18px;font-weight:700;color:#6b7280;">${totalUsedGB} GB</td>
                <td style="font-size:18px;font-weight:700;color:#6b7280;">${totalCapacityGB} GB</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="background:#ffffff;padding:24px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:16px 20px;border-radius:10px 10px 0 0;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td>
              <span style="font-size:18px;font-weight:700;color:#ffffff;">Huawei Cloud CBR</span>
              <span style="font-size:13px;color:rgba(255,255,255,0.8);margin-left:12px;">${accounts.length} cuenta(s) · ${totalVaults} vaults</span>
            </td>
          </tr>
        </table>
      </div>
      <div style="padding:20px;background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
        ${accountSections}
      </div>
    </td>
  </tr>

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

// ── Email plain text ──

export function generateVaultsEmailText(data: VaultsInformeData): string {
  const lines: string[] = [];
  lines.push("MC Inventory — Informe diario de capacidad de Vaults (Huawei Cloud)");
  lines.push(data.dateLabel);
  lines.push("");
  lines.push("=== RESUMEN EJECUTIVO ===");
  lines.push(`Total vaults: ${data.totalVaults}`);
  lines.push(`Críticos (≥90%): ${data.criticalVaults}`);
  lines.push(`Alerta (≥70%): ${data.warningVaults}`);
  lines.push(`Sanos (<70%): ${data.healthyVaults}`);
  lines.push(`Used Capacity %: ${data.avgUsedPercent}%`);
  lines.push(`Total usado: ${data.totalUsedGB} GB`);
  lines.push(`Total capacidad: ${data.totalCapacityGB} GB`);
  lines.push("");

  for (const acct of data.accounts) {
    lines.push(`-- ${acct.accountName} (${acct.accountId}) — ${acct.region} --`);
    lines.push(`  Vaults: ${acct.vaultCount} | Used Capacity: ${acct.totalUsedGB} GB | Vault Capacity: ${acct.totalCapacityGB} GB | Used Capacity %: ${acct.avgUsedPercent}%`);
    lines.push("");
    for (const v of acct.vaults) {
      const flag = v.usedPercent >= 90 ? "[CRÍTICO] " : v.usedPercent >= 70 ? "[ALERTA] " : "";
      lines.push(`  ${flag}${v.vaultName}: ${v.usedGB} / ${v.capacityGB} (${v.usedPercentStr})`);
    }
    lines.push("");
  }

  lines.push("—");
  lines.push("UX Technology · MC Inventory");
  lines.push("Informe generado automáticamente");

  return lines.join("\n");
}
