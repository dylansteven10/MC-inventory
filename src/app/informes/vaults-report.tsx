"use client";

import { AlertTriangle, CheckCircle2, HardDrive, XCircle } from "lucide-react";
import type { VaultsInformeData } from "@/lib/email/informe-vaults";
import { Collapsible, MetricCard } from "./shared";

type Props = {
  data: VaultsInformeData;
  cuentasAbiertas: Set<string>;
  onToggleCuenta: (id: string) => void;
};

function pctColor(pct: number): string {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#10b981";
}

function pctBadge(pct: number): string {
  if (pct >= 90) return "bg-red-500/10 text-red-400 border-red-500/20";
  if (pct >= 70) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
}

export default function VaultsReport({ data, cuentasAbiertas, onToggleCuenta }: Props) {
  return (
    <>
      {/* Resumen global */}
      <div className="page-section" style={{ animationDelay: "0.05s" }}>
        {data.criticalVaults > 0 && (
          <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
            <span className="text-2xl font-black text-red-400 tabular-nums">{data.criticalVaults}</span>
            <p className="text-sm font-semibold text-red-300">vault(s) con uso ≥ 90% — riesgo crítico</p>
          </div>
        )}
        {data.warningVaults > 0 && data.criticalVaults === 0 && (
          <div className="mb-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
            <span className="text-2xl font-black text-amber-400 tabular-nums">{data.warningVaults}</span>
            <p className="text-sm font-semibold text-amber-300">vault(s) con uso ≥ 70% — atención requerida</p>
          </div>
        )}
        {data.criticalVaults === 0 && data.warningVaults === 0 && (
          <div className="mb-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Todos los vaults con uso menor al 70%</p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <MetricCard label="Total vaults" value={data.totalVaults} icon={<HardDrive size={16} />} color="#8b5cf6" />
          <MetricCard label="Críticos (≥90%)" value={data.criticalVaults} icon={<XCircle size={16} />} color="#ef4444" />
          <MetricCard label="Alerta (≥70%)" value={data.warningVaults} icon={<AlertTriangle size={16} />} color="#f59e0b" />
          <MetricCard label="Sanos (&lt;70%)" value={data.healthyVaults} icon={<CheckCircle2 size={16} />} color="#10b981" />
          <MetricCard label="Used Capacity %" value={`${data.avgUsedPercent}%`} icon={<HardDrive size={16} />} color={pctColor(data.avgUsedPercent)} />
        </div>
      </div>

      {/* Detalle por cuenta */}
      <div className="page-section" style={{ animationDelay: "0.1s" }}>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/60 backdrop-blur-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <HardDrive size={16} className="text-red-400" />
              <span className="text-sm font-semibold">Huawei Cloud CBR</span>
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300">{data.accounts.length} cuentas · {data.totalVaults} vaults</span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Tabla resumen por cuenta */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--bg-hover)]/60 border-b border-[var(--border)]">
                  <tr>
                    {["Cuenta", "Región", "Vaults", "Used Capacity", "Vault Capacity", "Used Capacity %"].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => (
                    <tr key={a.accountId} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]/40 transition">
                      <td className="px-3 py-3 text-sm font-medium">{a.accountName}</td>
                      <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">{a.region}</td>
                      <td className="px-3 py-3 text-sm text-center">{a.vaultCount}</td>
                      <td className="px-3 py-3 text-sm text-center">{a.totalUsedGB} GB</td>
                      <td className="px-3 py-3 text-sm text-center">{a.totalCapacityGB} GB</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] border font-bold ${pctBadge(a.avgUsedPercent)}`}>
                          {a.avgUsedPercent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detalle por cuenta */}
            {data.accounts.map((a) => {
              const abierta = cuentasAbiertas.has(a.accountId);
              return (
                <Collapsible
                  key={a.accountId}
                  open={abierta}
                  onToggle={() => onToggleCuenta(a.accountId)}
                  title={<span className="truncate">{a.accountName} <span className="text-xs font-normal text-[var(--text-secondary)]">({a.region})</span></span>}
                  hint={`${a.vaultCount} vaults · used capacity ${a.avgUsedPercent}%`}
                >
                  <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                    <table className="w-full">
                      <thead className="bg-[var(--bg-hover)]/60 border-b border-[var(--border)]">
                        <tr>
                          {["Vault", "Used Capacity", "Vault Capacity", "Used Capacity %"].map((h) => (
                            <th key={h} className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-[var(--text-secondary)] whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {a.vaults.map((v) => (
                          <tr key={v.vaultId} className={`border-b border-[var(--border)]/50 hover:bg-[var(--bg-hover)]/30 transition ${v.usedPercent >= 90 ? "bg-red-500/[0.07]" : v.usedPercent >= 70 ? "bg-amber-500/[0.04]" : ""}`}>
                            <td className="px-3 py-2.5">
                              <p className="text-xs font-medium truncate max-w-[200px]">{v.vaultName}</p>
                              <p className="text-[10px] text-[var(--text-secondary)] font-mono truncate max-w-[200px]">{v.vaultId}</p>
                            </td>
                            <td className="px-3 py-2.5 text-xs whitespace-nowrap tabular-nums">{v.usedGB}</td>
                            <td className="px-3 py-2.5 text-xs whitespace-nowrap tabular-nums">{v.capacityGB}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] border font-bold ${pctBadge(v.usedPercent)}`}>{v.usedPercentStr}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
