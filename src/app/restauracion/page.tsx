"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/auth/roles";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  HardDrive,
  History,
  Info,
  Layers,
  Loader2,
  Monitor,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  XCircle,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import ScrollToTop from "@/components/ui/ScrollToTop";

type BackupRecord = {
  provider: string;
  accountId: string;
  accountName: string;
  region: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  backupId: string;
  backupName: string;
  status: string;
  sizeBytes: number;
  backupCreatedAt: string | null;
  backupCompletedAt: string | null;
  vaultName: string;
};

type ServerInfo = {
  provider: string;
  accountId: string;
  accountName: string;
  region: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  status: string;
  instanceType: string;
  operatingSystem: string;
  backups: BackupRecord[];
};

type RestoreJob = {
  id: string;
  provider: string;
  accountId: string;
  accountName: string;
  originalResourceId: string;
  originalResourceName: string;
  backupId: string;
  restoredResourceName: string;
  restoredResourceId: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};

type RestoreMode = "new" | "overwrite";

export default function RestauracionPage() {
  const { data: session } = useSession();
  const canExecute = !!session?.user?.role && hasPermission(session.user.role, "inventory:modify");

  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [jobs, setJobs] = useState<RestoreJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<"all" | "AWS" | "HUAWEI CLOUD">("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showJobs, setShowJobs] = useState(false);

  // Server-centric: selected server expands to show backups
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  // Modal flow: restoreMode shows confirm dialog, then executes directly
  const [restoreMode, setRestoreMode] = useState<{ backup: BackupRecord; mode: RestoreMode } | null>(null);

  // Auto-refresh for in-progress jobs
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [srvRes, jobRes] = await Promise.all([
        fetch("/api/restauracion/backups"),
        fetch("/api/restauracion/jobs"),
      ]);
      if (srvRes.ok) {
        const srvJson = await srvRes.json();
        setServers(srvJson.servers || []);
      } else {
        console.error("[restauracion] backups API error:", srvRes.status);
        toast.error("Error cargando servidores");
      }
      if (jobRes.ok) {
        const jobJson = await jobRes.json();
        setJobs(jobJson.jobs || []);
      }
    } catch {
      toast.error("Error cargando datos de restauración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30s when there are in-progress jobs
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "IN_PROGRESS" || j.status === "PENDING");
    if (!hasActive) { setAutoRefreshing(false); return; }
    setAutoRefreshing(true);
    const interval = setInterval(async () => {
      try {
        await fetch("/api/restauracion/jobs/refresh", { method: "POST" });
        const jobRes = await fetch("/api/restauracion/jobs");
        if (jobRes.ok) setJobs((await jobRes.json()).jobs || []);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [jobs]);

  const handleRestoreClick = (backup: BackupRecord) => {
    if (!canExecute) { toast.error("No tienes permisos para ejecutar restauraciones"); return; }
    setRestoreMode({ backup, mode: "new" });
  };

  const handleConfirmRestoreDirect = async (backup: BackupRecord) => {
    const restoredName = backup.resourceName + "-restaurado";

    setRestoring(backup.backupId);
    setSelectedServer(null);
    try {
      const res = await fetch("/api/restauracion/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: backup.provider,
          accountId: backup.accountId,
          accountName: backup.accountName,
          region: backup.region,
          backupId: backup.backupId,
          resourceId: backup.resourceId,
          resourceName: backup.resourceName,
          resourceType: backup.resourceType,
          mode: "new",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error iniciando restauración");
      toast.success(`Restauración iniciada: ${restoredName}`, { duration: 6000 });
      await fetchData();
      setTimeout(() => progressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    } catch (e: any) {
      toast.error(e?.message || "Error iniciando restauración", { duration: 8000 });
    } finally {
      setRestoring(null);
    }
  };

  const handleRefreshJobs = async () => {
    try {
      const res = await fetch("/api/restauracion/jobs/refresh", { method: "POST" });
      if (res.ok) { toast.success("Estados actualizados"); fetchData(); }
    } catch { toast.error("Error actualizando estados"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
            <RotateCcw size={20} className="animate-spin text-white" />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Cargando módulo de restauración...</p>
        </div>
      </div>
    );
  }

  // Filtered servers
  const filteredServers = servers.filter((s) => {
    if (providerFilter !== "all" && s.provider !== providerFilter) return false;
    if (accountFilter !== "all" && s.accountName !== accountFilter) return false;
    if (filterRegion !== "all" && (s.region || "N/A") !== filterRegion) return false;
    if (searchQuery && !s.resourceName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => a.resourceName.localeCompare(b.resourceName));

  const accounts = [...new Set(servers.map((s) => s.accountName))].sort();
  const uniqueRegions = [...new Set(servers.map((s) => s.region || "N/A"))].filter((r) => r !== "N/A" && r !== "none").sort();
  const providerServerCounts = {
    AWS: servers.filter((s) => s.provider === "AWS").length,
    "HUAWEI CLOUD": servers.filter((s) => s.provider === "HUAWEI CLOUD").length,
  };

  const activeJobs = jobs.filter((j) => j.status === "IN_PROGRESS" || j.status === "PENDING");
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");
  const failedJobs = jobs.filter((j) => j.status === "FAILED");

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
  };

  const providerBadge = (provider: string, small = false) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${provider === "AWS" ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" : "bg-red-500/10 text-red-300 border border-red-500/20"} ${small ? "text-[9px] px-1.5" : ""}`}>
      {provider === "AWS" ? "☁ AWS" : "🔴 Huawei"}
    </span>
  );

  const jobStatusIcon = (status: string) => {
    const s = status.toUpperCase();
    if (s === "COMPLETED") return <CheckCircle2 size={14} className="text-emerald-400" />;
    if (s === "FAILED") return <XCircle size={14} className="text-red-400" />;
    return <Loader2 size={14} className="animate-spin text-amber-400" />;
  };

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="rounded-2xl border border-[var(--border)] p-5" style={{ background: "var(--glass-bg)", backdropFilter: "blur(16px)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
              <RotateCcw size={20} />
            </div>
            <div className="flex items-center gap-2.5">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Restauración de servidores</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Restaure servidores desde backups disponibles</p>
              </div>
              <div className="relative group">
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-violet-500/10 border border-violet-500/20 cursor-help">
                  <Info size={13} className="text-violet-400" />
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 rounded-xl border border-violet-500/20 bg-[#0f172a] shadow-2xl shadow-black/40 p-3.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-l border-t border-violet-500/20 bg-[#0f172a]" />
                  <p className="text-xs font-bold text-violet-300 mb-1.5">Proceso de restauración de servidores</p>
                  <p className="text-[11px] text-slate-300/80 leading-relaxed">Seleccione un servidor, expanda para ver sus backups y elija cuál restaurar. Se creará un nuevo servidor con sufijo <code className="bg-violet-500/15 px-1 rounded font-mono text-violet-300">-restaurado</code> con la información del backup seleccionado. El servidor restaurado es temporal — elimínelo después de verificar.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative group">
              <button onClick={() => setShowJobs(true)} className="px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/60 text-sm flex items-center gap-2 hover:bg-[var(--bg-hover)] transition-all">
                <History size={16} /> Historial ({jobs.length})
              </button>
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[#0f172a] shadow-2xl shadow-black/40 p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                <p className="text-[11px] text-slate-300/80 leading-relaxed">Consulte el historial de restauraciones ejecutadas, su estado actual y mensajes de error.</p>
              </div>
            </div>
            <div className="relative group">
              <button onClick={() => { setLoading(true); fetchData(); }} className="px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/60 text-sm flex items-center gap-2 hover:bg-[var(--bg-hover)] transition-all">
                <RefreshCw size={16} /> Actualizar
              </button>
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[#0f172a] shadow-2xl shadow-black/40 p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                <p className="text-[11px] text-slate-300/80 leading-relaxed">Actualice la lista de servidores y backups disponibles para restauración.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Summary Cards ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/60 p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 rounded-full bg-violet-500/5" />
          <div className="flex items-center gap-2 mb-1">
            <Server size={13} className="text-violet-400" />
            <p className="text-[10px] uppercase tracking-widest text-violet-400 font-semibold">Total servidores</p>
          </div>
          <p className="text-2xl font-bold">{filteredServers.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/60 p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 rounded-full bg-amber-500/5" />
          <div className="flex items-center gap-2 mb-1">
            <Zap size={13} className="text-amber-400" />
            <p className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">En progreso</p>
          </div>
          <p className="text-2xl font-bold text-amber-400">{activeJobs.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/60 p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 rounded-full bg-emerald-500/5" />
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">Completadas</p>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{completedJobs.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/60 p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 rounded-full bg-red-500/5" />
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={13} className="text-red-400" />
            <p className="text-[10px] uppercase tracking-widest text-red-400 font-semibold">Fallidas</p>
          </div>
          <p className="text-2xl font-bold text-red-400">{failedJobs.length}</p>
        </div>
      </div>

      {/* ═══ Active Jobs Progress ═══ */}
      {activeJobs.length > 0 && (
        <div ref={progressRef} className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/20">
              <Loader2 size={16} className="animate-spin text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-300">{activeJobs.length} restauración(es) en progreso</p>
              {autoRefreshing && (
                <p className="text-[10px] text-amber-400/60 flex items-center gap-1 mt-0.5">
                  <Clock3 size={10} /> Auto-refresh cada 30s
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {activeJobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <Loader2 size={16} className="animate-spin text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{j.restoredResourceName}</p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {j.provider === "AWS" ? "AWS" : "Huawei"} · {j.accountName} · Iniciado {formatDate(j.createdAt)}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/20 uppercase tracking-wider">
                  {j.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["all", "AWS", "HUAWEI CLOUD"] as const).map((p) => (
            <div key={p} className="relative group">
              <button onClick={() => setProviderFilter(p)} className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${providerFilter === p ? "bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-600/20" : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"}`}>
                {p === "all" ? "Todos" : p === "AWS" ? `AWS (${providerServerCounts.AWS})` : `Huawei (${providerServerCounts["HUAWEI CLOUD"]})`}
              </button>
              <div className="absolute left-0 top-full mt-2 w-52 rounded-xl border border-[var(--border)] bg-[#0f172a] shadow-2xl shadow-black/40 p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                <p className="text-[11px] text-slate-300/80 leading-relaxed">{p === "all" ? "Mostrar servidores de todos los proveedores nube." : p === "AWS" ? "Filtrar solo servidores EC2 de Amazon Web Services." : "Filtrar solo servidores ECS de Huawei Cloud."}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="relative group">
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="px-3 py-2 rounded-xl text-sm border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] outline-none focus:border-violet-500/40">
            <option value="all">Todas las cuentas</option>
            {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[#0f172a] shadow-2xl shadow-black/40 p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
            <p className="text-[11px] text-slate-300/80 leading-relaxed">Filtre los servidores por cuenta de nube específica dentro del proveedor seleccionado.</p>
          </div>
        </div>
        {uniqueRegions.length > 1 && (
        <div className="relative group">
          <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} className="px-3 py-2 rounded-xl text-sm border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] outline-none focus:border-violet-500/40">
            <option value="all">Todas las regiones</option>
            {uniqueRegions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[#0f172a] shadow-2xl shadow-black/40 p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
            <p className="text-[11px] text-slate-300/80 leading-relaxed">Filtre los servidores por región de nube.</p>
          </div>
        </div>
        )}
        <div className="relative group">
          <Monitor size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]/50" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar servidor..." className="pl-8 pr-3 py-2 rounded-xl text-sm border border-[var(--border)] bg-[var(--bg-card)] outline-none focus:border-violet-500/40 placeholder:text-[var(--text-secondary)]/40 w-52" />
          <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[#0f172a] shadow-2xl shadow-black/40 p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
            <p className="text-[11px] text-slate-300/80 leading-relaxed">Busque un servidor por nombre para localizarlo rápidamente en la lista.</p>
          </div>
        </div>
      </div>

      {/* ═══ Server List ═══ */}
      <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--bg-card)]/40 flex items-center gap-2">
          <Layers size={15} className="text-violet-400" />
          <h2 className="text-sm font-semibold">Servidores ({filteredServers.length})</h2>
        </div>
        <div className="divide-y divide-[var(--border)]/50">
          {filteredServers.length === 0 ? (
            <div className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">No se encontraron servidores</div>
          ) : filteredServers.map((srv) => {
            const isOpen = selectedServer === srv.resourceId;
            const latestBackup = srv.backups[0];
            return (
              <div key={srv.resourceId}>
                {/* Server row */}
                <button
                  onClick={() => setSelectedServer(isOpen ? null : srv.resourceId)}
                  className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--bg-hover)]/30 transition-all text-left"
                >
                  <ChevronRight size={16} className={`text-[var(--text-secondary)] shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: srv.provider === "AWS" ? "linear-gradient(135deg,#f59e0b20,#f59e0b10)" : "linear-gradient(135deg,#ef444420,#ef444410)" }}>
                    <Server size={16} className={srv.provider === "AWS" ? "text-amber-400" : "text-red-400"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{srv.resourceName}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                      {providerBadge(srv.provider, true)}
                      <span>{srv.accountName}</span>
                      <span>·</span>
                      <span>{srv.backups.length} backup{srv.backups.length !== 1 ? "s" : ""}</span>
                    </p>
                  </div>
                  {latestBackup && (
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-[11px] text-[var(--text-secondary)]">Último backup</p>
                      <p className="text-xs font-medium mt-0.5">{formatDate(latestBackup.backupCompletedAt || latestBackup.backupCreatedAt)}</p>
                    </div>
                  )}
                </button>

                {/* Expanded backups */}
                {isOpen && (
                  <div className="bg-black/10 border-t border-[var(--border)]/30">
                    <div className="px-5 py-2.5 border-b border-[var(--border)]/20 bg-black/5">
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
                        <HardDrive size={11} /> Backups disponibles ({srv.backups.length})
                      </p>
                    </div>
                    <div className="divide-y divide-[var(--border)]/20">
                      {srv.backups.map((b) => (
                        <div key={b.backupId} className="px-5 py-3 flex items-center gap-3 hover:bg-[var(--bg-hover)]/20 transition-all">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                            <Database size={13} className="text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{b.backupName || b.backupId.slice(0, 24) + "…"}</p>
                            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                              <span>{formatDate(b.backupCompletedAt || b.backupCreatedAt)}</span>
                              <span>·</span>
                              <span>{formatBytes(b.sizeBytes)}</span>
                              <span>·</span>
                              <span className={b.status === "COMPLETED" || b.status === "AVAILABLE" ? "text-emerald-400" : "text-amber-400"}>{b.status}</span>
                            </p>
                          </div>
                          {b.status === "COMPLETED" || b.status === "AVAILABLE" ? (
                            <div className="relative group">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRestoreClick(b); }}
                                disabled={!!restoring || !canExecute}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 transition-all disabled:opacity-40 shadow-lg shadow-amber-600/20"
                                style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}
                              >
                                {restoring === b.backupId ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                Restaurar
                              </button>
                              <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-[var(--border)] bg-[#0f172a] shadow-2xl shadow-black/40 p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                                <p className="text-[11px] text-slate-300/80 leading-relaxed">Cree un nuevo servidor <code className="bg-violet-500/15 px-1 rounded font-mono text-violet-300">{b.resourceName}-restaurado</code> con la información de este backup.</p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[var(--text-secondary)] px-3">No disponible</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ Jobs Modal ═══ */}
      {showJobs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowJobs(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-3xl max-h-[80vh] rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-card)]/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20">
                  <History size={16} className="text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Historial de restauraciones</h2>
                  <p className="text-[10px] text-[var(--text-secondary)]">{jobs.length} restauración(es) registrada(s)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleRefreshJobs} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs flex items-center gap-1.5 hover:bg-[var(--bg-hover)] transition-all">
                  <RefreshCw size={12} /> Actualizar
                </button>
                <button onClick={() => setShowJobs(false)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs hover:bg-[var(--bg-hover)] transition-all">
                  Cerrar
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {jobs.length === 0 ? (
                <div className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">No hay restauraciones registradas</div>
              ) : (
                <div className="divide-y divide-[var(--border)]/50">
                  {jobs.map((j) => (
                    <div key={j.id} className="px-5 py-3.5 hover:bg-[var(--bg-hover)]/20 transition-all">
                      <div className="flex items-center gap-3">
                        {jobStatusIcon(j.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{j.originalResourceName}</p>
                            <ArrowRight size={12} className="text-[var(--text-secondary)] shrink-0" />
                            <p className="text-sm font-semibold text-emerald-300 truncate">{j.restoredResourceName}</p>
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                            {providerBadge(j.provider, true)}
                            <span>{j.accountName}</span>
                            <span>·</span>
                            <span>{formatDate(j.createdAt)}</span>
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider shrink-0 ${j.status === "COMPLETED" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : j.status === "FAILED" ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                          {j.status}
                        </span>
                      </div>
                      {j.error && (
                        <p className="text-[10px] text-red-400/80 mt-1.5 pl-9 truncate" title={j.error}>{j.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal: Confirm Restore ═══ */}
      {restoreMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setRestoreMode(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border)]" style={{ background: "linear-gradient(135deg, #ef444415, #f59e0b15)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-600 text-white shadow-lg">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold">⚠ Confirmar restauración</h2>
                  <p className="text-[10px] text-[var(--text-secondary)]">Esta acción no se puede deshacer</p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3.5 space-y-2.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Servidor original</span>
                  <span className="font-semibold">{restoreMode.backup.resourceName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Servidor restaurado</span>
                  <span className="font-semibold text-emerald-400">{restoreMode.backup.resourceName}-restaurado</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Proveedor</span>
                  <span className="font-semibold">{restoreMode.backup.provider === "AWS" ? "AWS" : "Huawei Cloud"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Cuenta</span>
                  <span className="font-medium">{restoreMode.backup.accountName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Tamaño backup</span>
                  <span className="font-medium">{formatBytes(restoreMode.backup.sizeBytes)}</span>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-200/80">
                  El servidor restaurado será <strong>temporal</strong>. Elimínelo después de verificar.
                </p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
              <button onClick={() => setRestoreMode(null)} className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-all">
                Cancelar
              </button>
              <button
                onClick={() => {
                  const backupToRestore = restoreMode!.backup;
                  setRestoreMode(null);
                  handleConfirmRestoreDirect(backupToRestore);
                }}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-red-600/20"
                style={{ background: "linear-gradient(135deg,#ef4444,#f97316)" }}
              >
                <RotateCcw size={14} />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <ScrollToTop />
    </div>
  );
}
