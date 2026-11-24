"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar, ChevronDown, ChevronUp, Database, Download,
  FileSpreadsheet, History, Loader2, Mail, RefreshCw, Search, Send,
  Server, Settings2, BookOpen, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import ScrollToTop from "@/components/ui/ScrollToTop";
import { exportBitacoraToExcel, exportBitacoraToPDF } from "@/lib/exports/bitacora";
import type { BitacoraRecord } from "@/lib/backups/bitacora";

// ── Helpers ──

function fmtDate(d: string): string {
  if (!d || d.length !== 8) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
function parseDate(s: string): string { return s.replace(/-/g, ""); }
function statusLabel(s: string): string {
  const m: Record<string, string> = { COMPLETED: "Completado", NO_BACKUP: "Sin backup", EMPTY: "Vacío", PARTIAL: "Parcial", EXPIRED: "Expirado" };
  return m[s] || s;
}
function providerLabel(p: string): string {
  return p === "AWS" ? "AWS" : p === "HUAWEI CLOUD" ? "Huawei Cloud" : p;
}
function serviceLabel(s: string): string {
  const m: Record<string, string> = { EC2: "EC2 (AWS)", ECS: "ECS (Huawei)", Log: "Logs", RDS: "RDS", DocumentDB: "DocumentDB", DDS: "DDS" };
  return m[s] || s;
}
function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}
function bogotaNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + (-5 * 60 * 60000));
}
function bogotaDateStr(daysAgo: number): string {
  const d = bogotaNow();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type TabType = "server" | "rds" | "log";
type SortField = "provider" | "accountName" | "service" | "instanceName" | "backupDate" | "status" | "sizeBytes" | "engine";
type Stats = { totalAllServers: number; excludedServers: number; totalInstances: number; totalRecords: number; completed: number; completedInstances: number; failed: number; noBackup: number; effectiveness: number };

const TAB_META: Record<TabType, { label: string; icon: any; color: string; bgColor: string }> = {
  server: { label: "Servidores", icon: Server, color: "text-violet-600", bgColor: "bg-violet-500/10 border-violet-500/30" },
  rds: { label: "Bases de datos", icon: Database, color: "text-cyan-600", bgColor: "bg-cyan-500/10 border-cyan-500/30" },
  log: { label: "Logs transaccionales", icon: History, color: "text-amber-600", bgColor: "bg-amber-500/10 border-amber-500/30" },
};

const COLUMNS: { key: string; label: string; field: SortField; w: number }[] = [
  { key: "provider", label: "Nube", field: "provider", w: 80 },
  { key: "accountName", label: "Cuenta", field: "accountName", w: 140 },
  { key: "service", label: "Servicio", field: "service", w: 80 },
  { key: "instanceName", label: "Instancia", field: "instanceName", w: 200 },
  { key: "engine", label: "Motor", field: "engine", w: 100 },
  { key: "backupDate", label: "Fecha", field: "backupDate", w: 80 },
  { key: "status", label: "Estado", field: "status", w: 90 },
  { key: "sizeBytes", label: "Tamaño", field: "sizeBytes", w: 70 },
];

// ── Component ──

export default function BitacoraPage() {
  const [tab, setTab] = useState<TabType>("server");
  const [records, setRecords] = useState<BitacoraRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [populating, setPopulating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<{ id: string; email: string; name: string | null; active: boolean }[]>([]);
  const [newRecipientEmail, setNewRecipientEmail] = useState("");
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(bogotaDateStr(1));
  const [dateTo, setDateTo] = useState(bogotaDateStr(1));

  const [sortBy, setSortBy] = useState<SortField>("provider");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [colVis, setColVis] = useState<Record<string, boolean>>({
    provider: true, accountName: true, service: true, instanceName: true,
    engine: true, backupDate: true, status: true, sizeBytes: true,
  });
  const [showColSettings, setShowColSettings] = useState(false);

  const [filterOpts, setFilterOpts] = useState<{
    providers: string[]; accounts: { id: string; name: string; provider: string }[];
    services: { name: string; provider: string }[];
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  const [needFilters, setNeedFilters] = useState(true);

  // Fetch data
  const fetchData = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("backupType", tab);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (providerFilter) params.set("provider", providerFilter);
      if (accountFilter) params.set("accountId", accountFilter);
      if (serviceFilter) params.set("service", serviceFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", parseDate(dateFrom));
      if (dateTo) params.set("dateTo", parseDate(dateTo));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (needFilters) params.set("needFilters", "1");

      const res = await fetch(`/api/bitacora?${params}`, { signal });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      setRecords(data.records || []);
      setTotal(data.total || 0);
      if (data.typeStats) setStats(data.typeStats);
      if (data.filterOptions) {
        setFilterOpts({
          providers: data.filterOptions.providers || [],
          accounts: data.filterOptions.accounts || [],
          services: data.filterOptions.services || [],
        });
        setNeedFilters(false);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      toast.error("Error cargando bitácora");
    } finally {
      setLoading(false);
    }
  }, [page, tab, debouncedSearch, providerFilter, accountFilter, serviceFilter, statusFilter, dateFrom, dateTo, sortBy, sortDir, needFilters]);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRecords([]);
    setStats(null);
    setTotal(0);
    fetchData(controller.signal);
    return () => { controller.abort(); };
  }, [fetchData]);

  // Populate
  const handlePopulate = async () => {
    setPopulating(true);
    try {
      const res = await fetch("/api/bitacora", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(`Bitácora actualizada: ${data.total} registros`);
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchData(controller.signal);
    } catch {
      toast.error("Error actualizando bitácora");
    } finally {
      setPopulating(false);
    }
  };

  // Manual data collection
  const handleCollect = async () => {
    setCollecting(true);
    try {
      const res = await fetch("/api/backups/refresh", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Datos recolectados. Actualizando bitácora...");
      await handlePopulate();
    } catch {
      toast.error("Error recolectando datos");
    } finally {
      setCollecting(false);
    }
  };

  // Email functions
  const fetchRecipients = useCallback(async () => {
    try {
      const res = await fetch("/api/informes/recipients");
      const json = await res.json();
      setEmailRecipients(json.recipients || []);
    } catch { /* ignore */ }
  }, []);

  const handleToggleRecipient = async (id: string, active: boolean) => {
    await fetch("/api/informes/recipients", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active }) });
    fetchRecipients();
  };

  const handleAddRecipient = async () => {
    if (!newRecipientEmail.trim()) return;
    await fetch("/api/informes/recipients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: newRecipientEmail.trim() }) });
    setNewRecipientEmail("");
    fetchRecipients();
  };

  const handleRemoveRecipient = async (id: string) => {
    await fetch(`/api/informes/recipients?id=${id}`, { method: "DELETE" });
    fetchRecipients();
  };

  // Send bitacora email
  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const params = new URLSearchParams();
      params.set("pageSize", "50000");
      params.set("backupType", tab);
      if (dateFrom) params.set("dateFrom", parseDate(dateFrom));
      if (dateTo) params.set("dateTo", parseDate(dateTo));
      if (providerFilter) params.set("provider", providerFilter);
      if (accountFilter) params.set("accountId", accountFilter);
      if (serviceFilter) params.set("service", serviceFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);

      const res = await fetch(`/api/bitacora?${params}`);
      const data = await res.json();
      const emailRecords: BitacoraRecord[] = data.records || [];

      if (emailRecords.length === 0) {
        toast.error("No hay datos para enviar");
        return;
      }

      const tabLabel = TAB_META[tab].label;
      const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");

      const emailRes = await fetch("/api/bitacora/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: emailRecords, tab, tabLabel, dateFrom, dateTo, filename: `bitacora-${tab}-${ts}.xlsx` }),
      });
      const emailData = await emailRes.json();
      if (emailData.success) {
        toast.success(`Correo enviado a ${emailData.recipients?.join(", ")}`);
      } else {
        toast.error(emailData.error || "Error enviando correo");
      }
    } catch {
      toast.error("Error enviando correo");
    } finally {
      setSendingEmail(false);
    }
  };

  // Sort
  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
  };
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return null;
    return sortDir === "asc" ? <ChevronUp size={11} className="inline ml-0.5" /> : <ChevronDown size={11} className="inline ml-0.5" />;
  };

  // Export
  const handleExport = async (format: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "50000");
      params.set("backupType", tab);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (providerFilter) params.set("provider", providerFilter);
      if (accountFilter) params.set("accountId", accountFilter);
      if (serviceFilter) params.set("service", serviceFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", parseDate(dateFrom));
      if (dateTo) params.set("dateTo", parseDate(dateTo));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);

      const res = await fetch(`/api/bitacora?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const exportRecords: BitacoraRecord[] = data.records || [];
      const ts = new Date().toISOString().slice(0, 10);
      const tabLabel = TAB_META[tab].label;

      if (format === "xlsx") {
        await exportBitacoraToExcel(exportRecords, `bitacora-${tab}-${ts}.xlsx`, `Bitácora — ${tabLabel}`, `Rango: ${dateFrom} a ${dateTo}`);
      } else {
        await exportBitacoraToPDF(exportRecords, `bitacora-${tab}-${ts}.pdf`, `Bitácora — ${tabLabel}`, `Rango: ${dateFrom} a ${dateTo}`);
      }
      toast.success(`Exportados ${exportRecords.length} registros`);
    } catch {
      toast.error("Error exportando");
    } finally {
      setExporting(false);
    }
  };

  // Pagination
  const totalPages = Math.ceil(total / pageSize);
  const pages = useMemo(() => {
    const p: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) p.push(i);
    return p;
  }, [page, totalPages]);

  const StatusBadge = ({ status }: { status: string }) => {
    const label = statusLabel(status);
    const cls = status === "COMPLETED"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : status === "NO_BACKUP"
        ? "bg-red-500/10 text-red-600 border-red-500/20"
        : status === "EMPTY"
          ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
          : "bg-slate-500/10 text-slate-600 border-slate-500/20";
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cls}`}>{label}</span>;
  };

  const selectCls = "h-8 px-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]";

  // Service options based on tab and provider
  const serviceOptions = useMemo(() => {
    const base = tab === "server" ? [{ name: "EC2", provider: "AWS" }, { name: "ECS", provider: "HUAWEI CLOUD" }]
      : tab === "rds" ? [{ name: "RDS", provider: "AWS" }, { name: "DocumentDB", provider: "AWS" }, { name: "DDS", provider: "HUAWEI CLOUD" }, { name: "RDS", provider: "HUAWEI CLOUD" }]
      : [{ name: "Log", provider: "AWS" }, { name: "Log", provider: "HUAWEI CLOUD" }];
    return base.filter(s => !providerFilter || s.provider === providerFilter);
  }, [tab, providerFilter]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <BookOpen size={24} className="text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Bitácora de Backups</h1>
              <p className="text-xs text-[var(--text-secondary)]">Historial consolidado de estado de backups por instancia y fecha</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePopulate} disabled={populating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition">
              <RefreshCw size={13} className={populating ? "animate-spin" : ""} />
              {populating ? "Actualizando..." : "Actualizar bitácora"}
            </button>
            <button onClick={() => { setShowConfig(true); fetchRecipients(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--bg-card)]/60 text-[var(--text-primary)]/70 hover:bg-[var(--bg-hover)] transition">
              <Settings2 size={13} /> Config
            </button>
          </div>
        </div>

        {/* ── Tab selector ── */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {(Object.keys(TAB_META) as TabType[]).map((t) => {
            const meta = TAB_META[t];
            const Icon = meta.icon;
            const active = tab === t;
            return (
              <button key={t} onClick={() => { setTab(t); setPage(1); setServiceFilter(""); }}
                className={`relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-150 ${active ? `${meta.bgColor} border-current ${meta.color}` : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]/30"}`}>
                <Icon size={22} />
                <div className="text-left">
                  <p className={`font-semibold text-sm ${active ? meta.color : "text-[var(--text-primary)]"}`}>{meta.label}</p>
                  {stats && active && (
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                      {stats.totalInstances} en plan · {stats.effectiveness.toFixed(1)}% efectividad
                    </p>
                  )}
                </div>
                {active && <div className={`absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${t === "server" ? "bg-violet-500" : t === "rds" ? "bg-cyan-500" : "bg-amber-500"}`} />}
              </button>
            );
          })}
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Total servidores</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{stats.totalAllServers}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-amber-600 uppercase tracking-wider">Excepciones</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{stats.excludedServers}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">En plan de backup</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{stats.totalInstances}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Total backups</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{stats.totalRecords.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-emerald-600 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 size={10} /> Con backup</p>
              <p className="text-xl font-bold text-emerald-600 mt-1">{stats.completedInstances.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-orange-600 uppercase tracking-wider flex items-center gap-1"><AlertTriangle size={10} /> Fallidos</p>
              <p className="text-xl font-bold text-orange-600 mt-1">{stats.failed.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-red-600 uppercase tracking-wider flex items-center gap-1"><XCircle size={10} /> Sin backup</p>
              <p className="text-xl font-bold text-red-600 mt-1">{stats.noBackup.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Efectividad</p>
              <p className={`text-xl font-bold mt-1 ${stats.effectiveness >= 90 ? "text-emerald-600" : stats.effectiveness >= 70 ? "text-amber-600" : "text-red-600"}`}>
                {stats.effectiveness.toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px] max-w-[240px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input type="text" placeholder="Buscar instancia, cuenta..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-8 pl-7 pr-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]" />
            </div>

            {/* Date range */}
            <Calendar size={13} className="text-[var(--text-secondary)]" />
            <input type="date" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className={selectCls} />
            <span className="text-xs text-[var(--text-secondary)]">→</span>
            <input type="date" value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className={selectCls} />

            {/* Provider */}
            <select value={providerFilter} onChange={(e) => { setProviderFilter(e.target.value); setAccountFilter(""); setServiceFilter(""); setPage(1); }} className={selectCls}>
              <option value="">Todas las nubes</option>
              {filterOpts?.providers.map((p) => <option key={p} value={p}>{providerLabel(p)}</option>)}
            </select>

            {/* Account (filtered by provider) */}
            <select value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">Todas las cuentas</option>
              {filterOpts?.accounts
                .filter(a => !providerFilter || a.provider === providerFilter)
                .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            {/* Service (filtered by tab + provider) */}
            <select value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">Todos los servicios</option>
              {serviceOptions.map((s, i) => (
                <option key={`${s.name}-${s.provider}-${i}`} value={s.name}>
                  {s.name === "EC2" ? "EC2 (AWS)" : s.name === "ECS" ? "ECS (Huawei)" : s.name === "RDS" ? "RDS" : s.name === "DocumentDB" ? "DocumentDB" : s.name === "DDS" ? "DDS" : s.name === "Log" ? "Logs" : s.name}
                </option>
              ))}
            </select>

            {/* Status */}
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">Todos los estados</option>
              <option value="COMPLETED">Completado</option>
              <option value="NO_BACKUP">Sin backup</option>
              <option value="EMPTY">Vacío</option>
              <option value="PARTIAL">Parcial</option>
            </select>

            {/* Column settings */}
            <div className="relative ml-auto">
              <button onClick={() => setShowColSettings(!showColSettings)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition">
                <Settings2 size={13} /> Columnas
              </button>
              {showColSettings && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-lg p-2 space-y-1">
                  {COLUMNS.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] px-1 py-0.5 rounded">
                      <input type="checkbox" checked={colVis[col.key]} onChange={(e) => setColVis({ ...colVis, [col.key]: e.target.checked })}
                        className="rounded border-[var(--border)] accent-[var(--primary)]" />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Export buttons */}
            <button onClick={() => handleExport("xlsx")} disabled={exporting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50 transition">
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button onClick={() => handleExport("pdf")} disabled={exporting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-red-500/30 text-red-600 hover:bg-red-500/10 disabled:opacity-50 transition">
              <Download size={13} /> PDF
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
              <span className="ml-2 text-sm text-[var(--text-secondary)]">Cargando bitácora...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--text-secondary)]">
              <BookOpen size={32} className="mb-2 opacity-50" />
              <p className="text-sm">No hay registros</p>
              <p className="text-xs mt-1">Presiona &quot;Actualizar bitácora&quot; para poblar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-hover)]/50">
                    {COLUMNS.filter((c) => colVis[c.key]).map((col) => (
                      <th key={col.key} onClick={() => handleSort(col.field)}
                        className="px-3 py-2.5 text-left font-semibold text-[var(--text-secondary)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-primary)] transition whitespace-nowrap"
                        style={{ minWidth: col.w }}>
                        {col.label} <SortIcon field={col.field} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id} className={`border-b border-[var(--border)] ${i % 2 === 0 ? "" : "bg-[var(--bg-hover)]/30"}`}>
                      {colVis.provider && <td className="px-3 py-2 text-[var(--text-primary)] whitespace-nowrap">{providerLabel(r.provider)}</td>}
                      {colVis.accountName && <td className="px-3 py-2 text-[var(--text-primary)] whitespace-nowrap">{r.accountName}</td>}
                      {colVis.service && <td className="px-3 py-2 text-[var(--text-primary)] whitespace-nowrap">{serviceLabel(r.service)}</td>}
                      {colVis.instanceName && <td className="px-3 py-2 text-[var(--text-primary)] font-medium">{r.instanceName}</td>}
                      {colVis.engine && <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">{r.engine || ""}</td>}
                      {colVis.backupDate && <td className="px-3 py-2 text-[var(--text-primary)] whitespace-nowrap font-mono">{fmtDate(r.backupDate)}</td>}
                      {colVis.status && <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={r.status} /></td>}
                      {colVis.sizeBytes && <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap text-right">{formatSize(r.sizeBytes)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)]">
                {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} de {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded text-xs border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--bg-hover)]">«</button>
                <button onClick={() => setPage(page - 1)} disabled={page === 1} className="px-2 py-1 rounded text-xs border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--bg-hover)]">‹</button>
                {pages.map((p) => (
                  <button key={p} onClick={() => setPage(p)} className={`px-2.5 py-1 rounded text-xs border transition ${p === page ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] font-semibold" : "border-[var(--border)] hover:bg-[var(--bg-hover)]"}`}>{p}</button>
                ))}
                <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="px-2 py-1 rounded text-xs border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--bg-hover)]">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded text-xs border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--bg-hover)]">»</button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Config Modal ── */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowConfig(false)}>
          <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Configuración Bitácora</h2>
              <button onClick={() => setShowConfig(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">✕</button>
            </div>
            <div className="p-4 space-y-5">
              {/* Manual collection */}
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-2">Recolectar datos manualmente</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-2">Vuelve a recolectar backups de todos los proveedores y actualiza la bitácora.</p>
                <button onClick={handleCollect} disabled={collecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition">
                  <RefreshCw size={13} className={collecting ? "animate-spin" : ""} />
                  {collecting ? "Recolectando..." : "Recolectar ahora"}
                </button>
              </div>
              {/* Email config */}
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-2">Envío por correo</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-2">Envía la bitácora actual (con filtros aplicados) como archivo Excel adjunto.</p>
                <button onClick={handleSendEmail} disabled={sendingEmail}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50 transition mb-3">
                  <Send size={13} className={sendingEmail ? "animate-pulse" : ""} />
                  {sendingEmail ? "Enviando..." : "Enviar correo ahora"}
                </button>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[var(--text-primary)]">Destinatarios</p>
                  {emailRecipients.filter(r => r.active).map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs bg-[var(--bg-hover)] rounded px-2 py-1">
                      <span className="text-[var(--text-primary)]">{r.email}{r.name ? ` (${r.name})` : ""}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleToggleRecipient(r.id, false)} className="text-amber-500 hover:text-amber-600" title="Desactivar">⊘</button>
                        <button onClick={() => handleRemoveRecipient(r.id)} className="text-red-500 hover:text-red-600" title="Eliminar">✕</button>
                      </div>
                    </div>
                  ))}
                  {emailRecipients.filter(r => !r.active).length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-[var(--text-secondary)]">Inactivos</p>
                      {emailRecipients.filter(r => !r.active).map(r => (
                        <div key={r.id} className="flex items-center justify-between text-xs opacity-50 px-2 py-1">
                          <span>{r.email}</span>
                          <button onClick={() => handleToggleRecipient(r.id, true)} className="text-emerald-500" title="Activar">⊕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1 mt-2">
                    <input type="email" value={newRecipientEmail} onChange={e => setNewRecipientEmail(e.target.value)}
                      placeholder="nuevo@correo.com" className="flex-1 text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]" />
                    <button onClick={handleAddRecipient} className="text-xs px-2 py-1 rounded bg-[var(--primary)] text-white hover:opacity-90">+</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ScrollToTop />
    </div>
  );
}
