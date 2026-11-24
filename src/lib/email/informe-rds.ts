import { queryAudit } from "@/lib/db/pool";
import {
  accountKey,
  getExpectedDatabases,
  getPreviousDayBogota,
  type Coverage,
  type DayWindow,
  type ExpectedResource,
} from "./compliance";

const UX_LOGO_SRC =
  "https://i0.wp.com/ux.technology/wp-content/uploads/2023/08/Logo-UX-Technology.png?fit=150%2C80&ssl=1";

export type RdsSnapshotDetail = {
  snapshotName: string;
  snapshotId: string;
  snapshotType: string;
  status: string;
  sizeBytes: number | null;
  snapshotCreatedAt: string | null;
  snapshotCompletedAt: string | null;
};

export type RdsInstanceDetail = {
  dbInstanceName: string;
  dbInstanceId: string;
  engine: string;
  region: string;
  totalSnapshots: number;
  lastSnapshot: string | null;
  coverage: Coverage;
  snapshots: RdsSnapshotDetail[];
  matchedViaCluster?: boolean;
  dbStatus?: string;
  weekendExempt?: boolean;
  isExpected?: boolean; // true if this instance is in the expected (inventory) list
};

export type RdsAccountDetail = {
  accountId: string;
  accountName: string;
  region: string;
  totalSnapshots: number;
  successfulSnapshots: number;
  failedSnapshots: number;
  inProgressSnapshots: number;
  engines: string[];
  instanceCount: number;
  missingInstances: number;
  coveragePct: number;
  lastSnapshot: string | null;
  instances: RdsInstanceDetail[];
};

export type RdsProviderReport = {
  provider: string;
  totalSnapshots: number;
  totalBytes: number;
  accounts: RdsAccountDetail[];
  successfulTotal: number;
  failedTotal: number;
  inProgressTotal: number;
  successRate: number;
  failureRate: number;
};

export type RdsInformeData = {
  generatedAt: string;
  dateLabel: string;
  day: DayWindow;
  aws: RdsProviderReport;
  huawei: RdsProviderReport;
  globalSummary: {
    totalAllDatabases: number;
    excludedDatabases: number;
    excludedNames: string[];
    excludedReasons: Record<string, string>;
    excludedAccounts: Record<string, string>;
    excludedWeekend: Array<{ name: string; account: string; reason: string }>;
    excludedPermanent: Array<{ name: string; account: string; reason: string }>;
    expectedDatabases: number;
    coveredDatabases: number;
    missingDatabases: number;
    coveragePct: number;
    totalBytes: number;
  };
};

const STOPPED_STATUSES = new Set(["stopped", "inactive", "unavailable"]);

function isStopped(status?: string): boolean {
  return !!status && STOPPED_STATUSES.has(status.toLowerCase());
}

const OK = new Set(["COMPLETED", "AVAILABLE"]);
const FAILED = new Set(["FAILED", "ERROR"]);
const IN_PROGRESS = new Set(["IN_PROGRESS", "PROTECTING", "CREATING", "COPYING", "RESTORING"]);

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
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

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (OK.has(s)) return "#10b981";
  if (FAILED.has(s)) return "#ef4444";
  if (IN_PROGRESS.has(s)) return "#f59e0b";
  return "#06b6d4";
}

function statusBg(status: string): string {
  const s = status.toUpperCase();
  if (OK.has(s)) return "#f0fdf4";
  if (FAILED.has(s)) return "#fef2f2";
  if (IN_PROGRESS.has(s)) return "#fffbeb";
  return "#f0f9ff";
}

type WindowRdsRow = {
  db_instance_id: string;
  db_instance_name: string;
  engine: string;
  snapshot_id: string;
  snapshot_name: string;
  snapshot_type: string;
  status: string;
  size_bytes: number | null;
  snapshot_created_at: string | null;
  snapshot_completed_at: string | null;
  region: string;
};

function rdsCoverageOf(status: string): Coverage {
  return OK.has(status.toUpperCase()) ? "OK" : "FAILED";
}

function rdsMissingInstance(exp: ExpectedResource, region?: string): RdsInstanceDetail {
  return {
    dbInstanceName: exp.resourceName,
    dbInstanceId: exp.resourceId,
    engine: "",
    region: region || "",
    totalSnapshots: 0,
    lastSnapshot: null,
    coverage: "MISSING",
    snapshots: [],
    dbStatus: exp.dbStatus || undefined,
    isExpected: true,
  };
}

/**
 * Informe de cumplimiento del DÍA ANTERIOR: cruza el inventario (bases de
 * datos esperadas) con los snapshots generados en la ventana de ayer.
 */
export async function generateRdsInformeData(day?: DayWindow): Promise<RdsInformeData> {
  const target = day || getPreviousDayBogota();
  const now = new Date();
  let expected = await getExpectedDatabases();
  const totalAllDatabases = expected.length;

  // Apply database exceptions (exclude dev/test DBs from compliance counts)
  const { filterExcludedDatabases } = await import("@/lib/email/db-exceptions");
  const { isWeekend } = await import("@/lib/backups/date-utils");
  const targetIsWeekend = isWeekend(target.ymd);
  const { included, excludedNames, excludedReasons, weekendExemptNames, excludedWeekendItems, excludedPermanentItems } = await filterExcludedDatabases(expected, (e) => e.resourceName, targetIsWeekend, (e) => e.accountName, (e) => e.accountId);
  const excludedCount = excludedNames.length;
  expected = included;
  const weekendExemptSet = new Set(weekendExemptNames.map((n) => n.toLowerCase()));

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

  const windowRes = await queryAudit<WindowRdsRow & { provider: string; account_id: string; account_name: string }>(
    `SELECT provider, account_id, account_name, db_instance_id, db_instance_name, engine, snapshot_id, snapshot_name, snapshot_type, status, size_bytes, snapshot_created_at, snapshot_completed_at, region
     FROM rds_backups
     WHERE snapshot_created_at >= $1 AND snapshot_created_at < $2
     ORDER BY provider, account_id, db_instance_id, snapshot_created_at DESC`,
    [target.startISO, target.endISO],
  );

  const windowByAccount = new Map<string, typeof windowRes.rows>();
  for (const row of windowRes.rows) {
    const key = accountKey(row.provider, row.account_id, row.region);
    const list = windowByAccount.get(key);
    if (list) list.push(row);
    else windowByAccount.set(key, [row]);
  }

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

  async function buildProviderReport(provider: "AWS" | "HUAWEI CLOUD"): Promise<RdsProviderReport> {
    const providerEntries = [...byAccount.values()].filter((a) => a.provider === provider);

    const accounts = providerEntries.map((acc) => {
      const rows = windowByAccount.get(accountKey(acc.provider, acc.accountId, acc.region)) || [];
      const byInstance = new Map<string, WindowRdsRow[]>();
      for (const r of rows) {
        const list = byInstance.get(r.db_instance_id);
        if (list) list.push(r);
        else byInstance.set(r.db_instance_id, [r]);
      }

      const seen = new Set<string>();
      const processedClusters = new Set<string>(); // Track Aurora/DocumentDB clusters already processed
      const instances: RdsInstanceDetail[] = [];
      let ok = 0;
      let failed = 0;
      let missing = 0;
      let bytes = 0;
      const engines = new Set<string>();
      let last: string | null = null;

      const toSnaps = (recs: WindowRdsRow[]): RdsSnapshotDetail[] => {
        // For Huawei RDS, there can be many incremental backups per day.
        // Keep only the latest incremental per instance, plus any full backups.
        const isHuawei = acc.provider === "HUAWEI CLOUD";
        let filtered = recs;
        if (isHuawei) {
          // Group by snapshot_type; for incremental, keep only the latest (first in DESC order)
          const fullBackups = recs.filter((r) => (r.snapshot_type || "").toLowerCase() !== "incremental");
          const incrementalBackups = recs.filter((r) => (r.snapshot_type || "").toLowerCase() === "incremental");
          // Keep only the latest incremental (recs are sorted by snapshot_created_at DESC)
          filtered = [...fullBackups, ...incrementalBackups.slice(0, 1)];
        }
        return filtered.slice(0, 20).map((r) => ({
          snapshotName: r.snapshot_name || r.snapshot_id,
          snapshotId: r.snapshot_id,
          snapshotType: r.snapshot_type || "",
          status: r.status,
          sizeBytes: r.size_bytes !== null && r.size_bytes !== undefined ? Number(r.size_bytes) : null,
          snapshotCreatedAt: r.snapshot_created_at ? new Date(r.snapshot_created_at).toISOString() : null,
          snapshotCompletedAt: r.snapshot_completed_at ? new Date(r.snapshot_completed_at).toISOString() : null,
        }));
      };

      for (const exp of acc.expected) {
        // Aurora/DocumentDB cluster deduplication:
        // If this instance belongs to a cluster that's already been processed, skip it.
        // Only the first instance per cluster is shown (using cluster name as display name).
        if (exp.clusterId) {
          const clusterKey = accountKey(acc.provider, acc.accountId, acc.region) + "||" + exp.clusterId.toLowerCase();
          if (processedClusters.has(clusterKey)) {
            // Skip duplicate cluster instance — already counted via the first instance
            continue;
          }
          processedClusters.add(clusterKey);
        }

        // For Aurora/DocumentDB clusters, use clusterId as the display name
        const displayName = exp.clusterId || exp.resourceName;
        const displayId = exp.clusterId || exp.resourceId;

        let recs = byInstance.get(exp.resourceId);
        let usedId = exp.resourceId;
        let matchedViaCluster = false;

        if (!recs) {
          // Fallback 1: match by instance name
          const byName = [...byInstance.entries()].find(
            ([, v]) => (v[0].db_instance_name || "").toLowerCase() === exp.resourceName.toLowerCase(),
          );
          if (byName) {
            usedId = byName[0];
            recs = byName[1];
          }
        }

        // Fallback 2: if this instance belongs to a cluster, check for cluster snapshot
        if (!recs && exp.clusterId) {
          const clusterRecs = byInstance.get(exp.clusterId);
          if (clusterRecs) {
            recs = clusterRecs;
            usedId = exp.clusterId;
            matchedViaCluster = true;
          } else {
            // Try cluster name as db_instance_name
            const byClusterName = [...byInstance.entries()].find(
              ([, v]) => (v[0].db_instance_name || "").toLowerCase() === exp.clusterId!.toLowerCase(),
            );
            if (byClusterName) {
              recs = byClusterName[1];
              usedId = byClusterName[0];
              matchedViaCluster = true;
            }
          }
        }

        if (!recs) {
          // Weekend-exempt DBs on weekends: not "missing", just skipped
          if (targetIsWeekend && (weekendExemptSet.has(exp.resourceName.toLowerCase()) || (exp.clusterId && weekendExemptSet.has(exp.clusterId.toLowerCase())))) {
            // Mark as OK with a special note — DB is off on weekends, no backup expected
            instances.push({
              dbInstanceName: displayName,
              dbInstanceId: displayId,
              engine: "",
              region: acc.region,
              totalSnapshots: 0,
              lastSnapshot: null,
              coverage: "OK",
              snapshots: [],
              weekendExempt: true,
              isExpected: true,
              matchedViaCluster: !!exp.clusterId,
            });
            ok++;
          } else {
            instances.push({
              ...rdsMissingInstance(exp, acc.region),
              dbInstanceName: displayName,
              dbInstanceId: displayId,
              matchedViaCluster: !!exp.clusterId,
            });
            missing++;
          }
          continue;
        }
        seen.add(usedId);
        const cov: Coverage = recs.some((r) => OK.has(r.status.toUpperCase())) ? "OK" : "FAILED";
        const eng = recs[0]?.engine || "";
        if (eng) engines.add(eng);
        if (cov === "OK") {
          ok++;
          // For bytes, use only the snapshots that toSnaps would show (deduplicated)
          const dedupedSnaps = toSnaps(recs);
          const dedupedIds = new Set(dedupedSnaps.map((s) => s.snapshotId));
          bytes += recs.filter((r) => dedupedIds.has(r.snapshot_id)).reduce((a, r) => a + Number(r.size_bytes || 0), 0);
        } else failed++;
        const lastRec = recs[0]?.snapshot_created_at || null;
        if (lastRec && (!last || lastRec > last)) last = lastRec;
        instances.push({
          dbInstanceName: displayName,
          dbInstanceId: displayId,
          engine: eng,
          region: acc.region,
          totalSnapshots: toSnaps(recs).length,
          lastSnapshot: lastRec ? new Date(lastRec).toISOString() : null,
          coverage: cov,
          snapshots: toSnaps(recs),
          matchedViaCluster: matchedViaCluster || !!exp.clusterId,
          dbStatus: exp.dbStatus || undefined,
          isExpected: true,
        });
      }

      for (const [iid, recs] of byInstance) {
        if (seen.has(iid)) continue;
        const cov: Coverage = recs.some((r) => OK.has(r.status.toUpperCase())) ? "OK" : "FAILED";
        const first = recs[0];
        if (cov === "OK") {
          const dedupedSnaps = toSnaps(recs);
          const dedupedIds = new Set(dedupedSnaps.map((s) => s.snapshotId));
          bytes += recs.filter((r) => dedupedIds.has(r.snapshot_id)).reduce((a, r) => a + Number(r.size_bytes || 0), 0);
        }
        if (first.engine) engines.add(first.engine);
        instances.push({
          dbInstanceName: first.db_instance_name || iid,
          dbInstanceId: iid,
          engine: first.engine || "",
          region: acc.region,
          totalSnapshots: toSnaps(recs).length,
          lastSnapshot: first.snapshot_created_at ? new Date(first.snapshot_created_at).toISOString() : null,
          coverage: cov,
          snapshots: toSnaps(recs),
          isExpected: false,
        });
      }

      instances.sort((a, b) => {
        const rank = (c: Coverage) => (c === "MISSING" ? 0 : c === "FAILED" ? 1 : 2);
        return rank(a.coverage) - rank(b.coverage) || a.dbInstanceName.localeCompare(b.dbInstanceName);
      });

      // Count unique instances with backup rows (for "no data" check)
      const uniqueInstancesWithBackup = new Set(rows.map((r) => r.db_instance_id)).size;
      // After Aurora cluster deduplication, totalInstances = ok + failed + missing
      // (not acc.expected.length which counts pre-dedup instances)
      const totalInstances = ok + failed + missing;
      // Per-account indicators: only count expected instances (isExpected !== false)
      // ok = expected instances with coverage OK
      // failed = expected instances with coverage FAILED (backup exists but failed)
      // missing = expected instances with coverage MISSING (no backup at all)
      // "Sin backup" = failed + missing (all non-OK expected instances)
      const sinBackup = failed + missing;

      return {
        accountId: acc.accountId,
        accountName: acc.accountName,
        region: rows[0]?.region || "",
        totalSnapshots: uniqueInstancesWithBackup,
        successfulSnapshots: ok,
        failedSnapshots: failed,
        inProgressSnapshots: 0,
        engines: [...engines],
        instanceCount: totalInstances,
        missingInstances: sinBackup,
        coveragePct: totalInstances ? Math.round((ok / totalInstances) * 100) : 0,
        lastSnapshot: last ? new Date(last).toISOString() : null,
        instances,
      };
    });

    const totalSnapshots = accounts.reduce((a, c) => a + c.totalSnapshots, 0);
    const successfulTotal = accounts.reduce((a, c) => a + c.successfulSnapshots, 0);
    const failedTotal = accounts.reduce((a, c) => a + c.failedSnapshots, 0);
    const inProgressTotal = accounts.reduce((a, c) => a + c.inProgressSnapshots, 0);
    const totalBytes = accounts.reduce(
      (a, c) => a + c.instances.filter((i) => i.coverage === "OK").reduce((x, i) => x + i.snapshots.filter((s) => OK.has(s.status.toUpperCase())).reduce((y, s) => y + (s.sizeBytes || 0), 0), 0),
      0,
    );

    return {
      provider: provider === "AWS" ? "AWS" : "Huawei Cloud",
      totalSnapshots,
      totalBytes,
      accounts,
      successfulTotal,
      failedTotal,
      inProgressTotal,
      successRate: accounts.reduce((a, c) => a + c.instanceCount, 0) ? Math.round((accounts.reduce((a, c) => a + c.instances.filter((i) => i.isExpected !== false && i.coverage === "OK").length, 0) / accounts.reduce((a, c) => a + c.instanceCount, 0)) * 100) : 0,
      failureRate: accounts.reduce((a, c) => a + c.instanceCount, 0) ? Math.round((accounts.reduce((a, c) => a + c.missingInstances, 0) / accounts.reduce((a, c) => a + c.instanceCount, 0)) * 100) : 0,
    };
  }

  const aws = await buildProviderReport("AWS");
  const huawei = await buildProviderReport("HUAWEI CLOUD");

  const expectedDatabases =
    aws.accounts.reduce((a, c) => a + c.instanceCount, 0) + huawei.accounts.reduce((a, c) => a + c.instanceCount, 0);
  const coveredDatabases =
    aws.accounts.reduce((a, c) => a + c.instances.filter((i) => i.isExpected !== false && i.coverage === "OK").length, 0) +
    huawei.accounts.reduce((a, c) => a + c.instances.filter((i) => i.isExpected !== false && i.coverage === "OK").length, 0);
  const failedDatabases =
    aws.accounts.reduce((a, c) => a + c.instances.filter((i) => i.isExpected !== false && i.coverage !== "OK").length, 0) +
    huawei.accounts.reduce((a, c) => a + c.instances.filter((i) => i.isExpected !== false && i.coverage !== "OK").length, 0);
  const globalBytes = aws.totalBytes + huawei.totalBytes;

  return {
    generatedAt: now.toISOString(),
    dateLabel: target.label,
    day: target,
    aws,
    huawei,
    globalSummary: {
      totalAllDatabases,
      excludedDatabases: excludedCount,
      excludedNames,
      excludedReasons: Object.fromEntries(excludedReasons),
      excludedAccounts: Object.fromEntries(
        excludedWeekendItems.concat(excludedPermanentItems).map((item) => [item.name, item.account])
      ),
      excludedWeekend: excludedWeekendItems.map((item) => ({
        name: item.name,
        account: item.account,
        reason: item.reason,
      })),
      excludedPermanent: excludedPermanentItems.map((item) => ({
        name: item.name,
        account: item.account,
        reason: item.reason,
      })),
      expectedDatabases,
      coveredDatabases,
      missingDatabases: failedDatabases,
      coveragePct: expectedDatabases ? Math.round((coveredDatabases / expectedDatabases) * 100) : 0,
      totalBytes: globalBytes,
    },
  };
}

function providerGradient(provider: string): string {
  return provider === "AWS"
    ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
    : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)";
}

function formatDateYMD(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.toLocaleDateString("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return y.replace(/-/g, "/");
}

function renderProviderSection(report: RdsProviderReport): string {
  const gradient = providerGradient(report.provider);
  const providerLabel = report.provider === "AWS" ? "AWS" : "Huawei Cloud";

  const accountSections = report.accounts
    .map((acc) => {
      // Build flat rows: one row per snapshot (or one row for MISSING instances)
      const rows: string[] = [];
      for (const inst of acc.instances) {
        if (inst.coverage === "MISSING") {
          const stoppedBadge = isStopped(inst.dbStatus);
          const statusLabel = stoppedBadge ? "Sin backup (db apagada)" : "SIN BACKUP";
          const statusBgColor = stoppedBadge ? "#f59e0b" : "#ef4444";
          const rowBg = stoppedBadge ? "background:#fffbeb;" : "background:#fef2f2;";
          const textColor = stoppedBadge ? "#92400e" : "#b91c1c";
          rows.push(`<tr style="${rowBg}">
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600;color:${textColor};">${esc(inst.dbInstanceName)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:${textColor};">—</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:${textColor};">—</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:${textColor};">${esc(inst.region)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;color:#ffffff;background:${statusBgColor};">${statusLabel}</span></td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:${textColor};">—</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:${textColor};text-align:right;">—</td>
          </tr>`);
          continue;
        }
        for (const s of inst.snapshots) {
          const sc = statusColor(s.status);
          const sb = statusBg(s.status);
          const clusterBadge = inst.matchedViaCluster ? ' <span style="display:inline-block;padding:1px 5px;border-radius:9999px;font-size:9px;font-weight:600;color:#0e7490;background:#ecfeff;">cluster</span>' : "";
          rows.push(`<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:500;color:#1f2937;">${esc(inst.dbInstanceName)}${clusterBadge}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;font-family:monospace;">${esc(s.snapshotId)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;">${esc(s.snapshotType || "—")}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;">${esc(inst.region)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;color:${sc};background:${sb};">${esc(s.status)}</span></td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;white-space:nowrap;">${formatDateYMD(s.snapshotCreatedAt)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:right;white-space:nowrap;">${s.sizeBytes !== null && s.sizeBytes > 0 ? formatBytes(s.sizeBytes) : "—"}</td>
          </tr>`);
        }
      }

      // Account summary stats
      const totalInstances = acc.instanceCount;
      const exitosos = acc.instances.filter((i) => i.isExpected !== false && i.coverage === "OK").length;
      const fallidos = acc.instances.filter((i) => i.isExpected !== false && (i.coverage === "FAILED" || i.coverage === "MISSING")).length;
      const coberturaPct = totalInstances ? Math.round((exitosos / totalInstances) * 100) : 0;

      return `
      <div style="margin-bottom:24px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">
          <tr>
            <td style="font-size:15px;font-weight:700;color:#1f2937;">${esc(acc.accountName)}</td>
            <td align="right" style="font-size:11px;color:#9ca3af;">${esc(acc.accountId)} · ${esc(acc.region)} · Total: ${totalInstances} · Exitosos: ${exitosos} · Fallidos: ${fallidos} · Cobertura: ${coberturaPct}%</td>
          </tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f9fafb;">
              <th align="left" style="padding:8px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Nombre</th>
              <th align="left" style="padding:8px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Snapshot</th>
              <th align="left" style="padding:8px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Tipo</th>
              <th align="left" style="padding:8px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Región</th>
              <th align="left" style="padding:8px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Estado</th>
              <th align="left" style="padding:8px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Fecha</th>
              <th align="right" style="padding:8px 10px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Tamaño</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
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
            <span style="font-size:13px;color:rgba(255,255,255,0.8);margin-left:12px;">${report.accounts.length} cuenta(s) · ${formatBytes(report.totalBytes)}</span>
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
export function generateRdsEmailHtml(data: RdsInformeData): string {
  const { aws, huawei, globalSummary, dateLabel } = data;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe diario de backups de bases de datos — ${esc(dateLabel)}</title>
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
            <div style="font-size:14px;color:#cbd5e1;margin-top:3px;">Informe diario de backups de bases de datos</div>
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
      <div style="font-size:12px;color:#6b7280;margin-bottom:16px;">Cobertura: ${globalSummary.coveredDatabases}/${globalSummary.expectedDatabases} bases de datos con backup exitoso (${globalSummary.coveragePct}%)${globalSummary.excludedDatabases > 0 ? ` · Excepciones: ${globalSummary.excludedDatabases} DBs excluidas` : ""}</div>
      ${globalSummary.missingDatabases > 0 ? `<div style="font-size:13px;font-weight:700;color:#ffffff;background:#ef4444;border-radius:8px;padding:12px 16px;margin-bottom:16px;">⚠ ${globalSummary.missingDatabases} BASE(S) DE DATOS SIN BACKUP — revisar detalle en rojo</div>` : `<div style="font-size:13px;font-weight:600;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">✓ Todas las bases de datos tienen snapshot del día anterior</div>`}
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="17%" style="padding:12px 14px;background:#f9fafb;border-radius:8px 0 0 0;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Total BDs</div>
            <div style="font-size:24px;font-weight:700;color:#1f2937;margin-top:4px;">${globalSummary.totalAllDatabases}</div>
          </td>
          <td width="17%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;">Excepciones</div>
            <div style="font-size:24px;font-weight:700;color:#f59e0b;margin-top:4px;">${globalSummary.excludedDatabases}</div>
          </td>
          <td width="17%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#06b6d4;text-transform:uppercase;letter-spacing:0.5px;">En plan</div>
            <div style="font-size:24px;font-weight:700;color:#06b6d4;margin-top:4px;">${globalSummary.expectedDatabases}</div>
          </td>
          <td width="17%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.5px;">Exitosos</div>
            <div style="font-size:24px;font-weight:700;color:#10b981;margin-top:4px;">${globalSummary.coveredDatabases}</div>
          </td>
          <td width="16%" style="padding:12px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#ef4444;text-transform:uppercase;letter-spacing:0.5px;">Fallidos</div>
            <div style="font-size:24px;font-weight:700;color:#ef4444;margin-top:4px;">${globalSummary.missingDatabases}</div>
          </td>
          <td width="16%" style="padding:12px 14px;background:#f9fafb;border-radius:0 8px 0 0;">
            <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.5px;">Cobertura</div>
            <div style="font-size:24px;font-weight:700;color:#10b981;margin-top:4px;">${globalSummary.coveragePct}%</div>
          </td>
        </tr>
      </table>
      ${globalSummary.excludedDatabases > 0 ? `<div style="margin-top:12px;padding:10px 14px;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;font-size:11px;color:#92400e;"><div style="font-weight:600;margin-bottom:4px;">Excepciones de bases de datos</div><div style="margin-bottom:8px;font-size:10px;color:#78350f;">Bases de datos de desarrollo, prueba o temporales que no requieren backup. Se excluyen de los conteos de cumplimiento del informe de Bases de Datos.</div>${globalSummary.excludedWeekend.length > 0 ? `<div style="margin-bottom:6px;"><div style="font-weight:600;margin-bottom:4px;">Excepciones de fin de semana (${globalSummary.excludedWeekend.length}):</div>${globalSummary.excludedWeekend.map(item => `<div style="margin:2px 0;padding:2px 0;">• Cuenta: <strong>${esc(item.account)}</strong> | Base de datos: <strong>${esc(item.name)}</strong> | Motivo: <span style="color:#78350f;">${esc(item.reason)}</span></div>`).join("")}</div>` : ""}${globalSummary.excludedPermanent.length > 0 ? `<div><div style="font-weight:600;margin-bottom:4px;">Excepciones permanentes (${globalSummary.excludedPermanent.length}):</div>${globalSummary.excludedPermanent.map(item => `<div style="margin:2px 0;padding:2px 0;">• Cuenta: <strong>${esc(item.account)}</strong> | Base de datos: <strong>${esc(item.name)}</strong> | Motivo: <span style="color:#78350f;">${esc(item.reason)}</span></div>`).join("")}</div>` : ""}</div>` : ""}
      <div style="margin-top:12px;font-size:11px;color:#9ca3af;">Volumen total: ${formatBytes(globalSummary.totalBytes)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="background:#ffffff;padding:0 32px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      ${renderProviderSection(aws)}
      ${renderProviderSection(huawei)}
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

export function generateRdsEmailText(data: RdsInformeData): string {
  const { aws, huawei, globalSummary, dateLabel } = data;

  const lines: string[] = [];
  lines.push("MC Inventory — Informe diario de backups de bases de datos (día anterior)");
  lines.push(dateLabel);
  lines.push("");
  lines.push("=== RESUMEN EJECUTIVO ===");
  lines.push(`Total BDs: ${globalSummary.totalAllDatabases}`);
  lines.push(`Excepciones: ${globalSummary.excludedDatabases}${globalSummary.excludedNames.length > 0 ? `\n${globalSummary.excludedNames.map(n => `  - ${n}${globalSummary.excludedReasons[n] ? ` (${globalSummary.excludedReasons[n]})` : ""}`).join("\n")}` : ""}`);
  lines.push(`En plan: ${globalSummary.expectedDatabases}`);
  lines.push(`Exitosos: ${globalSummary.coveredDatabases}`);
  lines.push(`Fallidos: ${globalSummary.missingDatabases}`);
  lines.push(`Cobertura: ${globalSummary.coveragePct}%`);
  lines.push(`Volumen total: ${formatBytes(globalSummary.totalBytes)}`);
  if (globalSummary.missingDatabases > 0) {
    lines.push(`!!! ${globalSummary.missingDatabases} BASE(S) DE DATOS SIN BACKUP !!!`);
  }
  lines.push("");

  function renderProvider(report: RdsProviderReport) {
    lines.push(`=== ${report.provider.toUpperCase()} ===`);
    lines.push(`Volumen: ${formatBytes(report.totalBytes)} | Cobertura: ${report.successRate}%`);
    lines.push("");
    for (const acc of report.accounts) {
      const totalInstances = acc.instanceCount;
      const exitosos = acc.instances.filter((i) => i.isExpected !== false && i.coverage === "OK").length;
      const fallidos = acc.instances.filter((i) => i.isExpected !== false && (i.coverage === "FAILED" || i.coverage === "MISSING")).length;
      const coberturaPct = totalInstances ? Math.round((exitosos / totalInstances) * 100) : 0;
      lines.push(`-- ${acc.accountName} (${acc.accountId}) — ${acc.region} — Total: ${totalInstances} | Exitosos: ${exitosos} | Fallidos: ${fallidos} | Cobertura: ${coberturaPct}% --`);
      lines.push("");
      lines.push("  Nombre | Snapshot | Tipo | Estado | Fecha | Tamaño");
      lines.push("  " + "-".repeat(100));
      for (const inst of acc.instances) {
        if (inst.coverage === "MISSING") {
          const stoppedTag = isStopped(inst.dbStatus) ? " (db apagada)" : "";
          lines.push(`  ${inst.dbInstanceName} | — | — | ${inst.region} | SIN BACKUP${stoppedTag} | — | —`);
          continue;
        }
        const clusterTag = inst.matchedViaCluster ? " [cluster]" : "";
        for (const s of inst.snapshots) {
          const size = s.sizeBytes !== null && s.sizeBytes > 0 ? formatBytes(s.sizeBytes) : "—";
          const date = formatDateYMD(s.snapshotCreatedAt);
          lines.push(`  ${inst.dbInstanceName}${clusterTag} | ${s.snapshotId} | ${s.snapshotType || "—"} | ${inst.region} | ${s.status} | ${date} | ${size}`);
        }
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

export function filterRdsInformeData(data: RdsInformeData, provider: "AWS" | "HUAWEI CLOUD"): RdsInformeData {
  const keep = provider === "AWS" ? data.aws : data.huawei;
  const empty: RdsProviderReport = {
    provider: provider === "AWS" ? "Huawei Cloud" : "AWS",
    totalSnapshots: 0,
    totalBytes: 0,
    accounts: [],
    successfulTotal: 0,
    failedTotal: 0,
    inProgressTotal: 0,
    successRate: 0,
    failureRate: 0,
  };
  const aws = provider === "AWS" ? keep : empty;
  const huawei = provider === "HUAWEI CLOUD" ? keep : empty;
  const covered = keep.accounts.reduce((a, c) => a + c.instances.filter((i) => i.isExpected !== false && i.coverage === "OK").length, 0);
  const expectedCount = keep.accounts.reduce((a, c) => a + c.instanceCount, 0);
  const failedCount = keep.accounts.reduce((a, c) => a + c.instances.filter((i) => i.isExpected !== false && i.coverage !== "OK").length, 0);
  return {
    ...data,
    aws,
    huawei,
    globalSummary: {
      totalAllDatabases: expectedCount + data.globalSummary.excludedDatabases,
      excludedDatabases: data.globalSummary.excludedDatabases,
      excludedNames: data.globalSummary.excludedNames,
      excludedReasons: data.globalSummary.excludedReasons,
      excludedAccounts: data.globalSummary.excludedAccounts,
      excludedWeekend: data.globalSummary.excludedWeekend,
      excludedPermanent: data.globalSummary.excludedPermanent,
      expectedDatabases: expectedCount,
      coveredDatabases: covered,
      missingDatabases: failedCount,
      coveragePct: expectedCount ? Math.round((covered / expectedCount) * 100) : 0,
      totalBytes: keep.totalBytes,
    },
  };
}
