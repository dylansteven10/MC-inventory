"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Settings, Plus, Trash2, RefreshCw, Globe, Cloud, Check, X, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

type CloudAccountEntry = {
  id: string;
  provider: "AWS" | "HUAWEI CLOUD";
  name: string;
  accountId: string;
  region: string;
  displayName: string | null;
  environment: string;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
};

export default function ConfiguracionPage() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<CloudAccountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [providerFilter, setProviderFilter] = useState<"all" | "AWS" | "HUAWEI CLOUD">("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Add form state
  const [newProvider, setNewProvider] = useState<"AWS" | "HUAWEI CLOUD">("AWS");
  const [newName, setNewName] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [newRegion, setNewRegion] = useState("");

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/cloud-accounts");
      const json = await res.json();
      setAccounts(json.accounts || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/cloud-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const json = await res.json();
      toast.success(`Sincronizadas ${json.synced} cuentas desde .env`);
      fetchAccounts();
    } catch (e: any) {
      toast.error(e?.message || "Error sincronizando");
    }
    setSyncing(false);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newAccountId.trim() || !newRegion.trim()) return;
    try {
      const res = await fetch("/api/cloud-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: newProvider,
          name: newName.trim(),
          accountId: newAccountId.trim(),
          region: newRegion.trim(),
          environment: "production",
          active: true,
        }),
      });
      if (!res.ok) throw new Error("No se pudo agregar");
      toast.success(`Cuenta ${newName.trim()} (${newRegion.trim()}) agregada`);
      setNewName(""); setNewAccountId(""); setNewRegion("");
      setShowAddForm(false);
      fetchAccounts();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo agregar la cuenta");
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la cuenta "${name}"?`)) return;
    try {
      await fetch("/api/cloud-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast.success(`Cuenta "${name}" eliminada`);
      fetchAccounts();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo eliminar");
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Group accounts by provider+name
  const filtered = accounts.filter((a) => providerFilter === "all" || a.provider === providerFilter);
  const grouped: Record<string, { provider: string; name: string; entries: CloudAccountEntry[] }> = {};
  for (const a of filtered) {
    const key = `${a.provider}||${a.name}`;
    if (!grouped[key]) grouped[key] = { provider: a.provider, name: a.name, entries: [] };
    grouped[key].entries.push(a);
  }
  const sortedGroups = Object.values(grouped).sort((a, b) => {
    const prov = a.provider.localeCompare(b.provider);
    return prov !== 0 ? prov : a.name.localeCompare(b.name);
  });

  // Stats
  const awsCount = accounts.filter((a) => a.provider === "AWS").length;
  const hwCount = accounts.filter((a) => a.provider === "HUAWEI CLOUD").length;
  const multiRegionCount = Object.values(grouped).filter((g) => g.entries.length > 1).length;
  const allRegions = [...new Set(accounts.map((a) => a.region))].sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
            <Settings size={20} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Configuración</h1>
            <p className="text-sm text-[var(--text-secondary)]">Cuentas cloud y regiones</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-500 disabled:opacity-40 transition-all"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sincronizando..." : "Sincronizar desde .env"}
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 transition-all"
          >
            <Plus size={14} />
            Agregar cuenta
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-hover)]/30 p-4">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{accounts.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">Total cuentas</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-2xl font-bold text-amber-300">{awsCount}</p>
          <p className="text-xs text-amber-300/70">AWS</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-2xl font-bold text-red-300">{hwCount}</p>
          <p className="text-xs text-red-300/70">Huawei Cloud</p>
        </div>
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <p className="text-2xl font-bold text-violet-300">{multiRegionCount}</p>
          <p className="text-xs text-violet-300/70">Multi-región</p>
        </div>
      </div>

      {/* Regions overview */}
      {allRegions.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-hover)]/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={14} className="text-cyan-400" />
            <p className="text-sm font-semibold">Regiones configuradas</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {allRegions.map((r) => {
              const count = accounts.filter((a) => a.region === r).length;
              const isAws = r.startsWith("us-") || r.startsWith("eu-") || r.startsWith("ap-") || r.startsWith("sa-") || r.startsWith("ca-");
              return (
                <span key={r} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${isAws ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}`}>
                  {r} <span className="opacity-60">({count})</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-3">
          <p className="text-sm font-semibold text-cyan-300">Agregar nueva cuenta/región</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Proveedor</label>
              <select value={newProvider} onChange={(e) => setNewProvider(e.target.value as any)} className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 outline-none focus:border-cyan-500/40">
                <option value="AWS">AWS</option>
                <option value="HUAWEI CLOUD">Huawei Cloud</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Nombre de la cuenta</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ej. siga-antioquia" className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 outline-none focus:border-cyan-500/40 placeholder:text-white/20" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">{newProvider === "AWS" ? "Account ID" : "Project ID"}</label>
              <input type="text" value={newAccountId} onChange={(e) => setNewAccountId(e.target.value)} placeholder={newProvider === "AWS" ? "ej. 617287376123" : "ej. 38874a92e7d44454951c174401002fb4"} className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 outline-none focus:border-cyan-500/40 placeholder:text-white/20" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Región</label>
              <input type="text" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder={newProvider === "AWS" ? "ej. us-west-2" : "ej. la-north-2"} className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 outline-none focus:border-cyan-500/40 placeholder:text-white/20" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleAdd} disabled={!newName.trim() || !newAccountId.trim() || !newRegion.trim()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-500 disabled:opacity-40 transition-all">
              <Plus size={14} /> Agregar
            </button>
            <button onClick={() => setShowAddForm(false)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-sm text-[var(--text-secondary)] hover:bg-white/10 transition-all">
              Cancelar
            </button>
          </div>
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300/80">
              {newProvider === "AWS"
                ? "Para AWS, las credenciales (AK/SK) se configuran en .env. La misma cuenta puede tener múltiples regiones usando AWS_ACCOUNT_{N}_REGIONS=us-east-1,us-west-2."
                : "Para Huawei Cloud, cada región tiene su propio Project ID. Agregue una entrada separada para cada región con su Project ID correspondiente. Las credenciales AK/SK se configuran en .env."}
            </p>
          </div>
        </div>
      )}

      {/* Provider filter */}
      <div className="flex items-center gap-2">
        {(["all", "AWS", "HUAWEI CLOUD"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProviderFilter(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              providerFilter === p
                ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                : "bg-white/5 text-[var(--text-secondary)] border-white/10 hover:bg-white/10"
            }`}
          >
            {p === "all" ? "Todas" : p === "AWS" ? "AWS" : "Huawei Cloud"}
          </button>
        ))}
        <span className="text-xs text-[var(--text-secondary)] ml-2">{filtered.length} cuentas</span>
      </div>

      {/* Account list */}
      <div className="space-y-2">
        {sortedGroups.map((group) => {
          const key = `${group.provider}||${group.name}`;
          const isExpanded = expandedAccounts.has(key);
          const isMultiRegion = group.entries.length > 1;
          const isAws = group.provider === "AWS";

          return (
            <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-hover)]/20 overflow-hidden">
              {/* Account header */}
              <button
                onClick={() => toggleExpand(key)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)]/30 transition-all text-left"
              >
                <Cloud size={16} className={isAws ? "text-amber-400" : "text-red-400"} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{group.name}</p>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${isAws ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}`}>
                      {isAws ? "AWS" : "HW"}
                    </span>
                    {isMultiRegion && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20 shrink-0">
                        {group.entries.length} regiones
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {group.entries[0].accountId} · {group.entries.map((e) => e.region).join(", ")}
                  </p>
                </div>
                {isExpanded ? <ChevronDown size={14} className="text-[var(--text-secondary)]" /> : <ChevronRight size={14} className="text-[var(--text-secondary)]" />}
              </button>

              {/* Expanded: regions */}
              {isExpanded && (
                <div className="border-t border-[var(--border)] p-3 space-y-1.5">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                      <Globe size={12} className="text-[var(--text-secondary)]" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)]">{entry.region}</p>
                        <p className="text-[10px] text-[var(--text-secondary)]">
                          {entry.accountId} · {entry.environment} · {entry.active ? "Activa" : "Inactiva"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemove(entry.id, `${group.name} (${entry.region})`)}
                        className="text-red-400/40 hover:text-red-400 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help section */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-hover)]/10 p-5 space-y-3">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Cómo agregar regiones</p>
        <div className="space-y-2 text-xs text-[var(--text-secondary)]">
          <div className="flex items-start gap-2">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">AWS</span>
            <p>Use <code className="px-1 py-0.5 rounded bg-white/5 text-cyan-300">AWS_ACCOUNT_{"{N}"}_REGIONS=us-east-1,us-west-2</code> en .env. La misma cuenta y credenciales se usan para todas las regiones.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 shrink-0">HW</span>
            <p>Cada región de Huawei Cloud tiene su propio Project ID. Agregue una nueva entrada numerada en .env: <code className="px-1 py-0.5 rounded bg-white/5 text-cyan-300">HUAWEI_ACCOUNT_{"{N}"}_NAME=acc_reditos</code>, <code className="px-1 py-0.5 rounded bg-white/5 text-cyan-300">HUAWEI_ACCOUNT_{"{N}"}_PROJECT_ID=...</code>, <code className="px-1 py-0.5 rounded bg-white/5 text-cyan-300">HUAWEI_ACCOUNT_{"{N}"}_REGION=na-mexico-1</code>. Las credenciales AK/SK son globales.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
