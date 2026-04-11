"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "./providers/ThemeProvider";

type InventoryItem = {
  accountName: string;
  accountId: string;
  service: string;
  name: string;
  id: string;
  host: string;
  status: string;
  operatingSystem?: string;
};

type UserRole = "admin" | "infraestructura" | "telecomunicaciones" | "basedatos" | "seguridad";

// Mapeo de roles a servicios visibles
const roleVisibleServices: Record<UserRole, string[]> = {
  admin: ["EC2", "RDS", "S3", "VPC", "Subnet"],
  infraestructura: ["EC2", "RDS", "S3", "VPC", "Subnet"],
  telecomunicaciones: ["VPC", "Subnet"],
  basedatos: ["RDS"],
  seguridad: [],
};

// Roles que pueden ejecutar comandos en EC2
const rolesCanExecuteCommands: UserRole[] = ["admin", "infraestructura"];

// Colores por servicio usando variables CSS
const serviceColors: Record<string, string> = {
  EC2: "bg-[var(--primary)]/20 text-[var(--primary)] border-[var(--primary)]",
  RDS: "bg-[var(--secondary)]/20 text-[var(--secondary)] border-[var(--secondary)]",
  S3: "bg-[var(--warning)]/20 text-[var(--warning)] border-[var(--warning)]",
  VPC: "bg-[var(--info)]/20 text-[var(--info)] border-[var(--info)]",
  Subnet: "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]",
};

export default function Home() {
  // Solo usar useTheme después de montado
  const [mounted, setMounted] = useState(false);
  let theme = "purple";
  let themeName = "Purple Passion";
  
  try {
    const themeHook = useTheme();
    if (mounted) {
      theme = themeHook.theme;
      themeName = themeHook.themeName;
    }
  } catch (e) {
    // Ignorar error durante SSR
  }
  
  const { data: session, status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mobileView, setMobileView] = useState(false);

  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [osFilter, setOsFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const [selected, setSelected] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [runningCommand, setRunningCommand] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCommand, setShowCommand] = useState(false);

  const userRole = (session?.user?.role || "infraestructura") as UserRole;
  const canExecuteCommands = rolesCanExecuteCommands.includes(userRole);
  const visibleServices = roleVisibleServices[userRole] || [];

  useEffect(() => {
    setMounted(true);
  }, []);

  // Detectar tamaño de pantalla
  useEffect(() => {
    const checkMobile = () => {
      setMobileView(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const loadFromCache = () => {
    try {
      const cached = localStorage.getItem('inventory-cache');
      const cachedTime = localStorage.getItem('inventory-cache-time');
      if (cached && cachedTime) {
        const cacheAge = Date.now() - parseInt(cachedTime);
        if (cacheAge < 5 * 60 * 1000) {
          const parsedData = JSON.parse(cached);
          setData(parsedData);
          setLastUpdated(new Date(parseInt(cachedTime)));
          return true;
        }
      }
    } catch (error) {
      console.error('Error loading from cache:', error);
    }
    return false;
  };

  const saveToCache = (inventoryData: InventoryItem[]) => {
    try {
      localStorage.setItem('inventory-cache', JSON.stringify(inventoryData));
      localStorage.setItem('inventory-cache-time', Date.now().toString());
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  };

  const clearCache = () => {
    try {
      localStorage.removeItem('inventory-cache');
      localStorage.removeItem('inventory-cache-time');
      setLastUpdated(null);
      fetchInventory(true);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };

  const fetchInventory = async (forceRefresh = false) => {
    if (!forceRefresh && loadFromCache()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      const filteredByRole = json.filter((item: InventoryItem) => 
        visibleServices.includes(item.service)
      );
      setData(filteredByRole);
      saveToCache(filteredByRole);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchInventory(false);
    }
  }, [status, userRole]);

  const getStatusStyle = (status: string) => {
    const s = status.toLowerCase();
    if (["running", "available", "active"].includes(s)) {
      return "bg-[var(--success)]/20 text-[var(--success)]";
    }
    if (["stopped", "terminated"].includes(s)) {
      return "bg-[var(--error)]/20 text-[var(--error)]";
    }
    return "bg-gray-500/20 text-gray-400";
  };

  const services = useMemo(
    () => [...new Set(data.map(i => i.service))].sort(),
    [data]
  );

  const accounts = useMemo(
    () => [...new Set(data.map(i => i.accountName))].sort(),
    [data]
  );

  const osList = useMemo(
    () => [...new Set(data.map(i => i.operatingSystem || "N/A"))].sort(),
    [data]
  );

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase());
      const matchesService = serviceFilter.length === 0 || serviceFilter.includes(item.service);
      const matchesAccount = accountFilter.length === 0 || accountFilter.includes(item.accountName);
      const matchesOS = osFilter.length === 0 || osFilter.includes(item.operatingSystem || "N/A");
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(item.status.toLowerCase());
      return matchesSearch && matchesService && matchesAccount && matchesOS && matchesStatus;
    });
  }, [data, search, serviceFilter, accountFilter, osFilter, statusFilter]);

  const total = filteredData.length;
  const running = filteredData.filter(i => ["running", "available", "active"].includes(i.status)).length;
  const stopped = total - running;

  const clearFilters = () => {
    setSearch("");
    setServiceFilter([]);
    setAccountFilter([]);
    setOsFilter([]);
    setStatusFilter([]);
  };

  const exportCSV = (rows: InventoryItem[], filename: string) => {
    const headers = ["Account", "Service", "Name", "ID", "Host", "OS", "Status"];
    const csv = [headers.join(","), ...rows.map(r => 
      [r.accountName, r.service, r.name, r.id, r.host, r.operatingSystem || "N/A", r.status]
        .map(v => `"${v}"`).join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allEC2Ids = filteredData.filter(i => i.service === "EC2").map(i => i.id);
  const isAllSelected = allEC2Ids.length > 0 && allEC2Ids.every(id => selected.includes(id));
  const toggleSelectAll = () => setSelected(isAllSelected ? [] : allEC2Ids);

  const runCommand = async () => {
    if (!command) return;
    if (!canExecuteCommands) {
      alert("Tu rol no tiene permisos para ejecutar comandos");
      return;
    }
    const instances = data.filter(i => selected.includes(i.id) && i.service === "EC2" && i.status === "running")
      .map(i => ({ instanceId: i.id, accountId: i.accountId }));
    if (!instances.length) {
      alert("Solo instancias EC2 en estado running");
      return;
    }
    setRunningCommand(true);
    setLogs(["🚀 Ejecutando comando...\n"]);
    try {
      const res = await fetch("/api/ec2/run-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances, command })
      });

      // ── Comando bloqueado por seguridad ──
      if (res.status === 403) {
        setLogs(["⚠️ El comando que está intentando ejecutar no está permitido."]);
        return;
      }

      // ── Error del servidor ──
      if (!res.ok) {
        setLogs([`❌ Error del servidor (${res.status})`]);
        return;
      }

      const result = await res.json();
      const newLogs = result.map((r: any) => {
        const displayName = data.find(i => i.id === r.instanceId)?.name || r.instanceId;
        return `[${r.accountId}] ${displayName}\n${r.output || r.error || "Sin salida"}\n${"-".repeat(40)}\n`;
      });
      setLogs(newLogs);
    } catch {
      setLogs(["❌ No se pudo conectar con el servidor"]);
    } finally {
      // ── Siempre desbloquea el botón ──
      setRunningCommand(false);
    }
  };

  // Si no está montado, mostrar loading simple
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[var(--text-secondary)]">Cargando inventario...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: `linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-card) 100%)` }}>
      {/* Header fijo */}
      <div className="sticky top-0 z-20 bg-[var(--bg-card)]/80 backdrop-blur-lg border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, var(--gradient-start), var(--gradient-end))` }}>
                <span className="text-white font-bold text-lg">MC</span>
              </div>
              <h1 className="text-2xl font-bold" style={{ background: `linear-gradient(135deg, var(--text-primary), var(--text-secondary))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Inventory
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-center">
              {/* Botón Perfil */}
              <button
                onClick={() => router.push("/profile")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--border)] transition-all"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, var(--gradient-start), var(--gradient-end))` }}>
                  {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{session?.user?.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{session?.user?.email}</p>
                </div>
              </button>

              <button onClick={() => signOut({ callbackUrl: "/login" })} 
                className="px-4 py-2 rounded-lg bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-all border border-[var(--error)]/20">
                Salir
              </button>
              
              <div className="flex gap-2">
                <button onClick={() => exportCSV(data, "inventory_all.csv")} 
                  className="px-3 py-2 rounded-lg bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/20 transition-all text-sm">
                  Exportar
                </button>
                <button onClick={() => fetchInventory(true)} disabled={loading}
                  className="px-3 py-2 rounded-lg bg-[var(--info)]/10 text-[var(--info)] hover:bg-[var(--info)]/20 transition-all text-sm disabled:opacity-50">
                  {loading ? "..." : "⟳"}
                </button>
                <button onClick={clearCache}
                  className="px-3 py-2 rounded-lg bg-[var(--warning)]/10 text-[var(--warning)] hover:bg-[var(--warning)]/20 transition-all text-sm">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        
        {/* Tarjetas de métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-[var(--bg-card)]/50 backdrop-blur-sm rounded-xl p-6 border border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[var(--text-secondary)] text-sm">Total recursos</p>
                <p className="text-3xl font-bold text-[var(--text-primary)]">{total}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8M12 8v8" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-[var(--bg-card)]/50 backdrop-blur-sm rounded-xl p-6 border border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[var(--text-secondary)] text-sm">En ejecución</p>
                <p className="text-3xl font-bold text-[var(--success)]">{running}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--success)]/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-[var(--bg-card)]/50 backdrop-blur-sm rounded-xl p-6 border border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[var(--text-secondary)] text-sm">Detenidos</p>
                <p className="text-3xl font-bold text-[var(--error)]">{stopped}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--error)]/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--error)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de búsqueda y filtros */}
        <div className="bg-[var(--bg-card)]/50 backdrop-blur-sm rounded-xl border border-[var(--border)] mb-6">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por nombre o ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[var(--bg-dark)] rounded-lg border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-all flex items-center gap-2 justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filtros
                {(serviceFilter.length > 0 || accountFilter.length > 0 || osFilter.length > 0 || statusFilter.length > 0) && (
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)]"></span>
                )}
              </button>
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-all"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Panel de filtros expandible */}
          {showFilters && (
            <div className="border-t border-[var(--border)] p-4 space-y-4">
              {services.length > 0 && (
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Servicios</p>
                  <div className="flex flex-wrap gap-2">
                    {services.map(s => (
                      <button
                        key={s}
                        onClick={() => setServiceFilter(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s])}
                        className={`px-3 py-1 rounded-full text-xs transition-all ${serviceFilter.includes(s) ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {accounts.length > 0 && (
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Cuentas</p>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map(a => (
                      <button
                        key={a}
                        onClick={() => setAccountFilter(prev => prev.includes(a) ? prev.filter(i => i !== a) : [...prev, a])}
                        className={`px-3 py-1 rounded-full text-xs transition-all ${accountFilter.includes(a) ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-[var(--text-secondary)] mb-2">Estado</p>
                <div className="flex flex-wrap gap-2">
                  {["running", "stopped"].map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s])}
                      className={`px-3 py-1 rounded-full text-xs transition-all ${statusFilter.includes(s) ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Botón ejecutar comando (solo si tiene permisos) */}
        {canExecuteCommands && visibleServices.includes("EC2") && (
          <div className="mb-6">
            <button
              onClick={() => setShowCommand(!showCommand)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-all border border-[var(--primary)]/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {showCommand ? "Ocultar terminal" : "Ejecutar comando"}
            </button>
            
            {showCommand && (
              <div className="mt-3 bg-[var(--bg-card)]/50 rounded-xl border border-[var(--border)] p-4">
                <textarea
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  placeholder="Ej: ls -la, df -h, uptime, systemctl status nginx"
                  className="w-full bg-[var(--bg-dark)] rounded-lg p-3 text-[var(--text-primary)] font-mono text-sm border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  rows={3}
                />
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={runCommand}
                    disabled={runningCommand || !command}
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] transition-all disabled:opacity-50"
                  >
                    {runningCommand ? "Ejecutando..." : "Ejecutar"}
                  </button>
                  <button
                    onClick={() => setCommand("")}
                    className="px-4 py-2 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-all"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Listado de recursos - Vista responsive */}
        {visibleServices.length === 0 ? (
          <div className="bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-xl p-8 text-center">
            <p className="text-[var(--warning)]">⚠️ Tu rol no tiene acceso a ningún servicio</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="bg-[var(--bg-card)]/50 rounded-xl p-8 text-center border border-[var(--border)]">
            <p className="text-[var(--text-secondary)]">No se encontraron recursos</p>
          </div>
        ) : (
          <>
            {/* Vista móvil: Tarjetas */}
            {mobileView ? (
              <div className="space-y-4">
                {filteredData.map((item) => (
                  <div key={`${item.accountId}-${item.id}`} className="bg-[var(--bg-card)]/50 rounded-xl border border-[var(--border)] p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-[var(--text-primary)]">{item.name}</h3>
                        <p className="text-xs text-[var(--text-secondary)] font-mono mt-1">{item.id}</p>
                      </div>
                      {canExecuteCommands && item.service === "EC2" && (
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-5 h-5 rounded border-[var(--border)] bg-[var(--bg-dark)] accent-[var(--primary)]"
                        />
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div>
                        <p className="text-xs text-[var(--text-secondary)]">Cuenta</p>
                        <p className="text-[var(--text-primary)]">{item.accountName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-secondary)]">Servicio</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${serviceColors[item.service] || 'bg-gray-500/20 text-gray-400'}`}>
                          {item.service}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-secondary)]">Host</p>
                        <p className="text-[var(--text-primary)] font-mono text-xs">{item.host}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-secondary)]">Estado</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${getStatusStyle(item.status)}`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                    
                    {item.operatingSystem && item.operatingSystem !== "N/A" && (
                      <div className="pt-2 border-t border-[var(--border)]">
                        <p className="text-xs text-[var(--text-secondary)]">SO</p>
                        <p className="text-xs text-[var(--text-primary)]">{item.operatingSystem}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Vista desktop: Tabla */
              <div className="bg-[var(--bg-card)]/50 rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[var(--bg-hover)]/50">
                      <tr>
                        {canExecuteCommands && <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] w-10">
                          <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="rounded border-[var(--border)] bg-[var(--bg-dark)] accent-[var(--primary)]" />
                        </th>}
                        <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)]">Cuenta</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)]">Servicio</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)]">Nombre</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)]">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)]">Host</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)]">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {filteredData.map((item) => (
                        <tr key={`${item.accountId}-${item.id}`} className="hover:bg-[var(--bg-hover)]/50 transition-colors">
                          {canExecuteCommands && item.service === "EC2" && (
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} className="rounded border-[var(--border)] bg-[var(--bg-dark)] accent-[var(--primary)]" />
                            </td>
                          )}
                          {canExecuteCommands && item.service !== "EC2" && <td className="px-4 py-3"></td>}
                          <td className="px-4 py-3 text-sm text-[var(--text-primary)]">{item.accountName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${serviceColors[item.service] || 'bg-gray-500/20 text-gray-400'}`}>
                              {item.service}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--text-primary)] font-medium">{item.name}</td>
                          <td className="px-4 py-3 text-sm text-[var(--text-secondary)] font-mono">{item.id}</td>
                          <td className="px-4 py-3 text-sm text-[var(--text-secondary)] font-mono">{item.host}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusStyle(item.status)}`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div className="mt-6 bg-black/80 rounded-xl border border-[var(--border)] p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">📋 Salida del comando</h3>
              <button onClick={() => setLogs([])} className="text-xs text-[var(--error)] hover:text-[var(--error)]/80">Limpiar</button>
            </div>
            <pre className="text-green-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">{logs.join("\n")}</pre>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-[var(--text-secondary)]">
          Última actualización: {lastUpdated ? lastUpdated.toLocaleString() : "No disponible"}
        </div>
      </div>
    </main>
  );
}