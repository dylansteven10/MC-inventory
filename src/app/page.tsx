"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

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

// Colores por servicio
const serviceColors: Record<string, string> = {
  EC2: "bg-blue-500/20 text-blue-400 border-blue-500",
  RDS: "bg-green-500/20 text-green-400 border-green-500",
  S3: "bg-yellow-500/20 text-yellow-400 border-yellow-500",
  VPC: "bg-purple-500/20 text-purple-400 border-purple-500",
  Subnet: "bg-cyan-500/20 text-cyan-400 border-cyan-500",
};

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
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
    setIsMounted(true);
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
      return "bg-green-500/20 text-green-400";
    }
    if (["stopped", "terminated"].includes(s)) {
      return "bg-red-500/20 text-red-400";
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
      const result = await res.json();
      const newLogs = result.map((r: any) => {
        const displayName = data.find(i => i.id === r.instanceId)?.name || r.instanceId;
        return `[${r.accountId}] ${displayName}\n${r.output || r.error || "Sin salida"}\n${"-".repeat(40)}\n`;
      });
      setLogs(newLogs);
    } catch {
      setLogs(["❌ Error al ejecutar comando"]);
    } finally {
      setRunningCommand(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando inventario...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header fijo */}
      <div className="sticky top-0 z-20 bg-gray-900/80 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">MC</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Inventory
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-center">
              {/* Botón Perfil */}
              <button
                onClick={() => router.push("/profile")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-sm font-bold">
                  {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium">{session?.user?.name}</p>
                  <p className="text-xs text-gray-400">{session?.user?.email}</p>
                </div>
              </button>

              <button onClick={() => signOut({ callbackUrl: "/login" })} 
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20">
                Salir
              </button>
              
              <div className="flex gap-2">
                <button onClick={() => exportCSV(data, "inventory_all.csv")} 
                  className="px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all text-sm">
                  Exportar
                </button>
                <button onClick={() => fetchInventory(true)} disabled={loading}
                  className="px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all text-sm disabled:opacity-50">
                  {loading ? "..." : "⟳"}
                </button>
                <button onClick={clearCache}
                  className="px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-all text-sm">
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
          <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total recursos</p>
                <p className="text-3xl font-bold text-white">{total}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8M12 8v8" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">En ejecución</p>
                <p className="text-3xl font-bold text-green-400">{running}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Detenidos</p>
                <p className="text-3xl font-bold text-red-400">{stopped}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de búsqueda y filtros */}
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-800 mb-6">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por nombre o ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 rounded-lg border border-gray-700 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-2 justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filtros
                {(serviceFilter.length > 0 || accountFilter.length > 0 || osFilter.length > 0 || statusFilter.length > 0) && (
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                )}
              </button>
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-all"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Panel de filtros expandible */}
          {showFilters && (
            <div className="border-t border-gray-800 p-4 space-y-4">
              {services.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Servicios</p>
                  <div className="flex flex-wrap gap-2">
                    {services.map(s => (
                      <button
                        key={s}
                        onClick={() => setServiceFilter(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s])}
                        className={`px-3 py-1 rounded-full text-xs transition-all ${serviceFilter.includes(s) ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {accounts.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Cuentas</p>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map(a => (
                      <button
                        key={a}
                        onClick={() => setAccountFilter(prev => prev.includes(a) ? prev.filter(i => i !== a) : [...prev, a])}
                        className={`px-3 py-1 rounded-full text-xs transition-all ${accountFilter.includes(a) ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 mb-2">Estado</p>
                <div className="flex flex-wrap gap-2">
                  {["running", "stopped"].map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s])}
                      className={`px-3 py-1 rounded-full text-xs transition-all ${statusFilter.includes(s) ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
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
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all border border-purple-500/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {showCommand ? "Ocultar terminal" : "Ejecutar comando"}
            </button>
            
            {showCommand && (
              <div className="mt-3 bg-gray-900/50 rounded-xl border border-gray-800 p-4">
                <textarea
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  placeholder="Ej: ls -la, df -h, uptime, systemctl status nginx"
                  className="w-full bg-gray-800 rounded-lg p-3 text-white font-mono text-sm border border-gray-700 focus:outline-none focus:border-purple-500"
                  rows={3}
                />
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={runCommand}
                    disabled={runningCommand || !command}
                    className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-all disabled:opacity-50"
                  >
                    {runningCommand ? "Ejecutando..." : "Ejecutar"}
                  </button>
                  <button
                    onClick={() => setCommand("")}
                    className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-all"
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
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-8 text-center">
            <p className="text-yellow-400">⚠️ Tu rol no tiene acceso a ningún servicio</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="bg-gray-900/50 rounded-xl p-8 text-center border border-gray-800">
            <p className="text-gray-400">No se encontraron recursos</p>
          </div>
        ) : (
          <>
            {/* Vista móvil: Tarjetas */}
            {mobileView ? (
              <div className="space-y-4">
                {filteredData.map((item) => (
                  <div key={`${item.accountId}-${item.id}`} className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-white">{item.name}</h3>
                        <p className="text-xs text-gray-500 font-mono mt-1">{item.id}</p>
                      </div>
                      {canExecuteCommands && item.service === "EC2" && (
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-5 h-5 rounded border-gray-600 bg-gray-700"
                        />
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div>
                        <p className="text-xs text-gray-500">Cuenta</p>
                        <p className="text-gray-300">{item.accountName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Servicio</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${serviceColors[item.service] || 'bg-gray-500/20 text-gray-400'}`}>
                          {item.service}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Host</p>
                        <p className="text-gray-300 font-mono text-xs">{item.host}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Estado</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${getStatusStyle(item.status)}`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                    
                    {item.operatingSystem && item.operatingSystem !== "N/A" && (
                      <div className="pt-2 border-t border-gray-800">
                        <p className="text-xs text-gray-500">SO</p>
                        <p className="text-xs text-gray-400">{item.operatingSystem}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Vista desktop: Tabla */
              <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-800/50">
                      <tr>
                        {canExecuteCommands && <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 w-10">
                          <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="rounded border-gray-600" />
                        </th>}
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Cuenta</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Servicio</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Nombre</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Host</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {filteredData.map((item) => (
                        <tr key={`${item.accountId}-${item.id}`} className="hover:bg-gray-800/50 transition-colors">
                          {canExecuteCommands && item.service === "EC2" && (
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} className="rounded border-gray-600" />
                            </td>
                          )}
                          {canExecuteCommands && item.service !== "EC2" && <td className="px-4 py-3"></td>}
                          <td className="px-4 py-3 text-sm text-gray-300">{item.accountName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${serviceColors[item.service] || 'bg-gray-500/20 text-gray-400'}`}>
                              {item.service}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-white font-medium">{item.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.id}</td>
                          <td className="px-4 py-3 text-sm text-gray-400 font-mono">{item.host}</td>
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
          <div className="mt-6 bg-black/80 rounded-xl border border-gray-800 p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-gray-400">📋 Salida del comando</h3>
              <button onClick={() => setLogs([])} className="text-xs text-red-400 hover:text-red-300">Limpiar</button>
            </div>
            <pre className="text-green-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">{logs.join("\n")}</pre>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-600">
          Última actualización: {lastUpdated ? lastUpdated.toLocaleString() : "No disponible"}
        </div>
      </div>
    </main>
  );
}