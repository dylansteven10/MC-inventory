"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "./providers/ThemeProvider";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type InventoryItem = {
  provider?: string;
  accountName: string;
  accountId: string;
  service: string;
  name: string;
  id: string;
  host: string;
  status: string;
  operatingSystem?: string;
};

type UserRole =
  | "admin"
  | "infraestructura"
  | "telecomunicaciones"
  | "basedatos"
  | "seguridad";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const CACHE_KEY      = "inventory-cache";
const CACHE_TIME_KEY = "inventory-cache-time";
const CACHE_TTL_MS   = 5 * 60 * 1000;  // 5 minutos
const FETCH_TIMEOUT  = 30_000;          // 30 segundos máximo de espera

const ROLE_VISIBLE_SERVICES: Record<UserRole, string[]> = {

  admin: [
    "EC2",
    "ECS",
    "RDS",
    "S3",
    "VPC",
    "Subnet"
  ],

  infraestructura: [
    "EC2",
    "ECS",
    "RDS",
    "S3",
    "VPC",
    "Subnet"
  ],

  telecomunicaciones: [
    "VPC",
    "Subnet"
  ],

  basedatos: [
    "RDS"
  ],

  seguridad: [],

};

const ROLES_CAN_EXECUTE: UserRole[] = ["admin", "infraestructura"];

const SERVICE_COLORS: Record<string, string> = {
  EC2:    "bg-[var(--primary)]/20   text-[var(--primary)]   border-[var(--primary)]",
  RDS:    "bg-[var(--secondary)]/20 text-[var(--secondary)] border-[var(--secondary)]",
  S3:     "bg-[var(--warning)]/20   text-[var(--warning)]   border-[var(--warning)]",
  VPC:    "bg-[var(--info)]/20      text-[var(--info)]      border-[var(--info)]",
  Subnet: "bg-[var(--accent)]/20    text-[var(--accent)]    border-[var(--accent)]",
  ECS:    "bg-[var(--primary)]/20   text-[var(--primary)]   border-[var(--primary)]",
};

const LOADING_STEPS = [
  { progress: 10, message: "Conectando con AWS..." },
  { progress: 25, message: "Consultando cuentas cloud..." },
  { progress: 45, message: "Obteniendo recursos EC2 y RDS..." },
  { progress: 65, message: "Analizando redes y almacenamiento..." },
  { progress: 85, message: "Procesando inventario consolidado..." },
  { progress: 95, message: "Aplicando filtros y permisos..." },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getStatusStyle(status: string): string {
  const s = status.toLowerCase();
  if (["running", "available", "active"].includes(s))
    return "bg-[var(--success)]/20 text-[var(--success)]";
  if (["stopped", "terminated"].includes(s))
    return "bg-[var(--error)]/20 text-[var(--error)]";
  return "bg-gray-500/20 text-gray-400";
}

function exportCSV(rows: InventoryItem[], filename: string): void {
  const headers = ["Provider", "Account", "Service", "Name", "ID", "Host", "OS", "Status"];
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      [r.provider ?? "AWS", r.accountName, r.service, r.name, r.id, r.host, r.operatingSystem ?? "N/A", r.status]
        .map((v) => `"${v}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function Home() {
  // ── Theme (safe SSR) ──────────────────────
  const [mounted, setMounted] = useState(false);
  let theme     = "purple";
  let themeName = "Purple Passion";

  try {
    const themeHook = useTheme();
    if (mounted) {
      theme     = themeHook.theme;
      themeName = themeHook.themeName;
    }
  } catch {
    // Ignorar error durante SSR
  }

  // ── Auth / Routing ────────────────────────
  const { data: session, status } = useSession();
  const router = useRouter();

  // ── Data ──────────────────────────────────
  const [data,        setData]        = useState<InventoryItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Loading ───────────────────────────────
  // Hard load = no existe la key de sesión en sessionStorage.
  // sessionStorage se borra con F5/Ctrl+R o al abrir nueva pestaña.
  // Se conserva en navegación interna de Next.js (router.push / Link).
  const _isHardLoad = typeof window !== "undefined"
    ? !sessionStorage.getItem("mc-inv-session")
    : false;

  const [loading, setLoading] = useState<boolean>(_isHardLoad); // splash inmediato en hard load
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage,  setLoadingMessage]  = useState("Inicializando inventario cloud...");
  const [fetchError,      setFetchError]      = useState<string | null>(null);

  // ── UI state ──────────────────────────────
  const [mobileView,   setMobileView]   = useState(false);
  const [showFilters,  setShowFilters]  = useState(false);
  const [showCommand,  setShowCommand]  = useState(false);

  // ── Filters ───────────────────────────────
  const [search,        setSearch]        = useState("");
  const [serviceFilter, setServiceFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [osFilter,      setOsFilter]      = useState<string[]>([]);
  const [statusFilter,  setStatusFilter]  = useState<string[]>([]);

  // ── Commands ──────────────────────────────
  const [selected,       setSelected]       = useState<string[]>([]);
  const [command,        setCommand]        = useState("");
  const [logs,           setLogs]           = useState<string[]>([]);
  const [runningCommand, setRunningCommand] = useState(false);

  // ── Role / Permissions ────────────────────
  const userRole        = (session?.user?.role ?? "infraestructura") as UserRole;
  const canExecute      = ROLES_CAN_EXECUTE.includes(userRole);
  const visibleServices = ROLE_VISIBLE_SERVICES[userRole] ?? [];

  // ── First load detection ──────────────────
  // Leer sessionStorage directamente al inicializar el ref (no en useEffect)
  // para que isHardLoad sea correcto desde el primer render.
  // sessionStorage se resetea con F5/Ctrl+R o al abrir nueva pestaña,
  // pero se conserva en navegación interna de Next.js.
  // useRef con el mismo valor calculado arriba (reutilizar _isHardLoad)
  const isHardLoad = useRef<boolean>(_isHardLoad);

  // ─────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────

  useEffect(() => {
    setMounted(true);
    // Marcar que la sesión ya está activa → próximas navegaciones internas no son hard load
    sessionStorage.setItem("mc-inv-session", "1");
  }, []);

  useEffect(() => {
    const check = () => setMobileView(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      const forceRefresh = isHardLoad.current;
      isHardLoad.current = false; // resetear antes del fetch

      if (forceRefresh) {
        // Hard load: activar splash inmediatamente antes del fetch
        setLoading(true);
        setLoadingProgress(0);
        setLoadingMessage("Inicializando inventario cloud...");
      }

      fetchInventory(forceRefresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userRole]);

  // ─────────────────────────────────────────
  // Cache helpers
  // ─────────────────────────────────────────

  const loadFromCache = (): boolean => {
    try {
      const cached     = localStorage.getItem(CACHE_KEY);
      const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
      if (cached && cachedTime) {
        const age = Date.now() - parseInt(cachedTime, 10);
        if (age < CACHE_TTL_MS) {
          setData(JSON.parse(cached));
          setLastUpdated(new Date(parseInt(cachedTime, 10)));
          setLoading(false); // ← asegurar que el splash se apague aunque loading fuera true
          return true;
        }
      }
    } catch (err) {
      console.error("Error loading cache:", err);
    }
    return false;
  };

  const saveToCache = (items: InventoryItem[]): void => {
    try {
      const now = Date.now();
      localStorage.setItem(CACHE_KEY,      JSON.stringify(items));
      localStorage.setItem(CACHE_TIME_KEY, now.toString());
      setLastUpdated(new Date(now));
    } catch (err) {
      console.error("Error saving cache:", err);
    }
  };

  const clearCache = (): void => {
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TIME_KEY);
      setLastUpdated(null);
    } catch (err) {
      console.error("Error clearing cache:", err);
    }
    fetchInventory(true);
  };

  // ─────────────────────────────────────────
  // Fetch
  // ─────────────────────────────────────────

  const fetchInventory = async (forceRefresh = false): Promise<void> => {
    if (!forceRefresh && loadFromCache()) return;

    setLoading(true);
    setFetchError(null);
    setLoadingProgress(0);
    setLoadingMessage("Conectando con AWS...");

    let step = 0;
    const interval = setInterval(() => {
      if (step < LOADING_STEPS.length) {
        setLoadingProgress(LOADING_STEPS[step].progress);
        setLoadingMessage(LOADING_STEPS[step].message);
        step++;
      }
    }, 500);

    // AbortController para cancelar el fetch si supera el timeout
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch("/api/inventory", { signal: controller.signal });

      if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.statusText}`);

      const json = await res.json();

      const filtered = (json as InventoryItem[]).filter((item) =>
        visibleServices.includes(item.service)
      );

      clearInterval(interval);
      setLoadingProgress(100);
      setLoadingMessage("Inventario actualizado correctamente");

      await new Promise((r) => setTimeout(r, 700));

      setData(filtered);
      saveToCache(filtered);

    } catch (err: any) {
      clearInterval(interval);
      console.error("Error fetching inventory:", err);

      const isTimeout = err?.name === "AbortError";
      const message   = isTimeout
        ? `La solicitud tardó más de ${FETCH_TIMEOUT / 1000}s. Verifica que /api/inventory esté respondiendo.`
        : `No se pudo cargar el inventario: ${err?.message ?? "error desconocido"}`;

      setFetchError(message);
      setLoadingMessage("Error al conectar con la API");

    } finally {
      clearTimeout(timeoutId);
      clearInterval(interval);
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────
  // Derived / memoized values
  // ─────────────────────────────────────────

  const services = useMemo(
    () => [...new Set(data.map((i) => i.service))].sort(),
    [data]
  );

  const accounts = useMemo(
    () => [...new Set(data.map((i) => i.accountName))].sort(),
    [data]
  );

  const providers = useMemo(
    () => [...new Set(data.map((i) => i.provider ?? "AWS"))].sort(),
    [data]
  );

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const q = search.toLowerCase();
      return (
        (item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)) &&
        (serviceFilter.length === 0 || serviceFilter.includes(item.service)) &&
        (accountFilter.length === 0 || accountFilter.includes(item.accountName)) &&
        (osFilter.length      === 0 || osFilter.includes(item.operatingSystem ?? "N/A")) &&
        (statusFilter.length  === 0 || statusFilter.includes(item.status.toLowerCase()))
      );
    });
  }, [data, search, serviceFilter, accountFilter, osFilter, statusFilter]);

  const total   = filteredData.length;
  const running = filteredData.filter((i) =>
    ["running", "available", "active"].includes(i.status.toLowerCase())
  ).length;
  const stopped = total - running;

  const allEC2Ids =
  filteredData.filter(
    (i) =>
      i.service === "EC2" ||
      i.service === "ECS"
  ).map((i) => i.id);
  const isAllSelected =
    allEC2Ids.length > 0 && allEC2Ids.every((id) => selected.includes(id));

  // ─────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────

  const clearFilters = () => {
    setSearch("");
    setServiceFilter([]);
    setAccountFilter([]);
    setOsFilter([]);
    setStatusFilter([]);
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );

  const toggleSelectAll = () =>
    setSelected(isAllSelected ? [] : allEC2Ids);

  const toggleFilter = <T,>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    value: T
  ) =>
    setter((prev) =>
      prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value]
    );

  const runCommand = async (): Promise<void> => {
    if (!command.trim()) return;
    if (!canExecute) {
      alert("Tu rol no tiene permisos para ejecutar comandos.");
      return;
    }

    const instances = data
      .filter((i) => selected.includes(i.id) && i.service === "EC2" && i.status === "running")
      .map((i) => ({ instanceId: i.id, accountId: i.accountId }));

    if (!instances.length) {
      alert("Selecciona al menos una instancia EC2 en estado running.");
      return;
    }

    setRunningCommand(true);
    setLogs(["🚀 Ejecutando comando...\n"]);

    try {
      const res = await fetch("/api/ec2/run-command", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ instances, command }),
      });

      if (res.status === 403) {
        setLogs(["⚠️ Comando bloqueado por política de seguridad."]);
        return;
      }
      if (!res.ok) {
        setLogs([`❌ Error del servidor (${res.status})`]);
        return;
      }

      const result = await res.json();
      setLogs(
        result.map((r: any) => {
          const name = data.find((i) => i.id === r.instanceId)?.name ?? r.instanceId;
          return `[${r.accountId}] ${name}\n${r.output ?? r.error ?? "Sin salida"}\n${"-".repeat(40)}\n`;
        })
      );
    } catch {
      setLogs(["❌ No se pudo conectar con el servidor."]);
    } finally {
      setRunningCommand(false);
    }
  };

  // ─────────────────────────────────────────
  // Render guards
  // ─────────────────────────────────────────

  // Mostrar splash en TODOS estos casos:
  // 1. Componente no hidratado aún (SSR)
  // 2. Sesión verificándose (status === "loading")
  // 3. Fetch de inventario activo
  const showSplash = !mounted || status === "loading" || loading;

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-dark)] overflow-hidden">
        {/* Decorativo */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-96 h-96 bg-[var(--primary)] rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[var(--secondary)] rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-xl px-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl mb-6 animate-pulse"
              style={{ background: "linear-gradient(135deg, var(--gradient-start), var(--gradient-end))" }}
            >
              <span className="text-white text-4xl font-bold">MC</span>
            </div>
            <h1
              className="text-4xl font-bold mb-3"
              style={{
                background: "linear-gradient(135deg, var(--text-primary), var(--text-secondary))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              MC Inventory
            </h1>
            <p className="text-[var(--text-secondary)] text-center text-lg">
              Actualizando inventario cloud centralizado
            </p>
          </div>

          {/* Card */}
          <div className="bg-[var(--bg-card)]/70 backdrop-blur-xl border border-[var(--border)] rounded-3xl p-8 shadow-2xl">
            {fetchError ? (
              /* ── Estado de error ── */
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[var(--error)]/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-[var(--error)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h3 className="text-[var(--error)] font-semibold text-lg mb-2">
                  Error al cargar el inventario
                </h3>
                <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed">
                  {fetchError}
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => fetchInventory(true)}
                    className="px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-all"
                  >
                    Reintentar
                  </button>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="px-5 py-2.5 rounded-xl bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20 font-medium hover:bg-[var(--error)]/20 transition-all"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </div>
            ) : (
              /* ── Estado de carga normal ── */
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[var(--text-primary)] font-medium text-lg">
                    Sincronizando recursos
                  </span>
                  <span className="text-[var(--primary)] font-bold text-xl">
                    {loadingProgress}%
                  </span>
                </div>

                {/* Barra de progreso */}
                <div className="w-full h-5 bg-[var(--bg-dark)] rounded-full overflow-hidden border border-[var(--border)] mb-6">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${loadingProgress}%`,
                      background: "linear-gradient(90deg, var(--gradient-start), var(--gradient-end))",
                    }}
                  />
                </div>

                <p className="text-[var(--text-secondary)] text-sm text-center">
                  {loadingMessage}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────

  const hasActiveFilters =
    serviceFilter.length > 0 ||
    accountFilter.length > 0 ||
    osFilter.length > 0 ||
    statusFilter.length > 0;

  return (
    <main
      className="min-h-screen"
      style={{ background: "linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-card) 100%)" }}
    >
      {/* ── Header ──────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[var(--bg-card)]/80 backdrop-blur-lg border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, var(--gradient-start), var(--gradient-end))" }}
              >
                <span className="text-white font-bold text-lg">MC</span>
              </div>
              <h1
                className="text-2xl font-bold"
                style={{
                  background: "linear-gradient(135deg, var(--text-primary), var(--text-secondary))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Inventory
              </h1>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 justify-center">
              {/* Perfil */}
              <button
                onClick={() => router.push("/profile")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--border)] transition-all"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg, var(--gradient-start), var(--gradient-end))" }}
                >
                  {session?.user?.name?.charAt(0).toUpperCase() ?? "U"}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{session?.user?.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{session?.user?.email}</p>
                </div>
              </button>

              {/* Salir */}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="px-4 py-2 rounded-lg bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-all border border-[var(--error)]/20"
              >
                Salir
              </button>

              {/* Acciones rápidas */}
              <div className="flex gap-2">
                <button
                  onClick={() => exportCSV(data, "inventory_all.csv")}
                  title="Exportar CSV"
                  className="px-3 py-2 rounded-lg bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/20 transition-all text-sm"
                >
                  Exportar
                </button>
                <button
                  onClick={() => {
                    setLoading(true);
                    setLoadingProgress(0);
                    setFetchError(null);
                    setLoadingMessage("Conectando con AWS...");
                    fetchInventory(true);
                  }}
                  disabled={loading}
                  title="Actualizar inventario"
                  className="px-3 py-2 rounded-lg bg-[var(--info)]/10 text-[var(--info)] hover:bg-[var(--info)]/20 transition-all text-sm disabled:opacity-50"
                >
                  {loading ? "..." : "⟳"}
                </button>
                <button
                  onClick={() => {
                    setLoading(true);
                    setLoadingProgress(0);
                    setFetchError(null);
                    setLoadingMessage("Limpiando caché...");
                    clearCache();
                  }}
                  title="Limpiar caché y recargar"
                  className="px-3 py-2 rounded-lg bg-[var(--warning)]/10 text-[var(--warning)] hover:bg-[var(--warning)]/20 transition-all text-sm"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            {
              label: "Total recursos",
              value: total,
              color: "var(--primary)",
              icon: (
                <path
                  strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3zM8 12h8M12 8v8"
                />
              ),
            },
            {
              label: "En ejecución",
              value: running,
              color: "var(--success)",
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ),
            },
            {
              label: "Detenidos",
              value: stopped,
              color: "var(--error)",
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ),
            },
          ].map(({ label, value, color, icon }) => (
            <div
              key={label}
              className="bg-[var(--bg-card)]/50 backdrop-blur-sm rounded-xl p-6 border border-[var(--border)]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[var(--text-secondary)] text-sm">{label}</p>
                  <p className="text-3xl font-bold" style={{ color }}>{value}</p>
                </div>
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }}
                >
                  <svg className="w-6 h-6" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {icon}
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Búsqueda y filtros */}
        <div className="bg-[var(--bg-card)]/50 backdrop-blur-sm rounded-xl border border-[var(--border)] mb-6">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Búsqueda */}
              <div className="flex-1 relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por nombre o ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[var(--bg-dark)] rounded-lg border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              {/* Toggle filtros */}
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="px-4 py-2 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-all flex items-center gap-2 justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filtros
                {hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                )}
              </button>

              {/* Limpiar */}
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-all"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Panel de filtros */}
          {showFilters && (
            <div className="border-t border-[var(--border)] p-4 space-y-4">
              {/* Servicios */}
              {services.length > 0 && (
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Servicios</p>
                  <div className="flex flex-wrap gap-2">
                    {services.map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleFilter(setServiceFilter, s)}
                        className={`px-3 py-1 rounded-full text-xs transition-all ${
                          serviceFilter.includes(s)
                            ? "bg-[var(--primary)] text-white"
                            : "bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cuentas */}
              {accounts.length > 0 && (
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Cuentas</p>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((a) => (
                      <button
                        key={a}
                        onClick={() => toggleFilter(setAccountFilter, a)}
                        className={`px-3 py-1 rounded-full text-xs transition-all ${
                          accountFilter.includes(a)
                            ? "bg-[var(--primary)] text-white"
                            : "bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Estado */}
              <div>
                <p className="text-xs text-[var(--text-secondary)] mb-2">Estado</p>
                <div className="flex flex-wrap gap-2">
                  {["running", "stopped"].map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleFilter(setStatusFilter, s)}
                      className={`px-3 py-1 rounded-full text-xs transition-all ${
                        statusFilter.includes(s)
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Terminal / Ejecutar comando */}
        {canExecute && visibleServices.includes("EC2") && (
          <div className="mb-6">
            <button
              onClick={() => setShowCommand((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-all border border-[var(--primary)]/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {showCommand ? "Ocultar terminal" : "Ejecutar comando"}
            </button>

            {showCommand && (
              <div className="mt-3 bg-[var(--bg-card)]/50 rounded-xl border border-[var(--border)] p-4">
                <textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Ej: ls -la, df -h, uptime, systemctl status nginx"
                  rows={3}
                  className="w-full bg-[var(--bg-dark)] rounded-lg p-3 text-[var(--text-primary)] font-mono text-sm border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] resize-none"
                />
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={runCommand}
                    disabled={runningCommand || !command.trim()}
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-all disabled:opacity-50"
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

        {/* Listado de recursos */}
        {visibleServices.length === 0 ? (
          <div className="bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-xl p-8 text-center">
            <p className="text-[var(--warning)]">⚠️ Tu rol no tiene acceso a ningún servicio.</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="bg-[var(--bg-card)]/50 rounded-xl p-8 text-center border border-[var(--border)]">
            <p className="text-[var(--text-secondary)]">No se encontraron recursos.</p>
          </div>
        ) : mobileView ? (
          /* ── Vista móvil: Tarjetas ── */
          <div className="space-y-4">
            {filteredData.map((item) => (
              <div
                key={`${item.accountId}-${item.id}`}
                className="bg-[var(--bg-card)]/50 rounded-xl border border-[var(--border)] p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{item.name}</h3>
                    <p className="text-xs text-[var(--text-secondary)] font-mono mt-1">{item.id}</p>
                  </div>
                  {canExecute && item.service === "EC2" || item.service === "ECS" && (
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
                    <p className="text-xs text-[var(--text-secondary)]">Ubicación</p>
                    <p className="text-[var(--text-primary)]">
                      {item.provider ?? "AWS"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">Cuenta</p>
                    <p className="text-[var(--text-primary)]">
                      {item.accountName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">Servicio</p>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${SERVICE_COLORS[item.service] ?? "bg-gray-500/20 text-gray-400"}`}>
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
          /* ── Vista desktop: Tabla ── */
          <div className="bg-[var(--bg-card)]/50 rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--bg-hover)]/50">
                  <tr>
                    {canExecute && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] w-10">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          className="rounded border-[var(--border)] bg-[var(--bg-dark)] accent-[var(--primary)]"
                        />
                      </th>
                    )}
                    {["Ubicación", "Cuenta", "Servicio", "Nombre", "ID", "Host", "Estado"].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)]"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredData.map((item) => (
                    <tr
                      key={`${item.accountId}-${item.id}`}
                      className="hover:bg-[var(--bg-hover)]/50 transition-colors"
                    >
                      {canExecute && (
                        <td className="px-4 py-3">
                          {item.service === "EC2" && (
                            <input
                              type="checkbox"
                              checked={selected.includes(item.id)}
                              onChange={() => toggleSelect(item.id)}
                              className="rounded border-[var(--border)] bg-[var(--bg-dark)] accent-[var(--primary)]"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-medium text-[var(--primary)]">
                        {item.provider ?? "AWS"}
                      </td>

                      <td className="px-4 py-3 text-sm text-[var(--text-primary)]">
                        {item.accountName}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs ${SERVICE_COLORS[item.service] ?? "bg-gray-500/20 text-gray-400"}`}>
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

        {/* Logs */}
        {logs.length > 0 && (
          <div className="mt-6 bg-black/80 rounded-xl border border-[var(--border)] p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">📋 Salida del comando</h3>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-[var(--error)] hover:opacity-80 transition-opacity"
              >
                Limpiar
              </button>
            </div>
            <pre className="text-green-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
              {logs.join("\n")}
            </pre>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-[var(--text-secondary)]">
          Última actualización:{" "}
          {lastUpdated ? lastUpdated.toLocaleString() : "No disponible"}
        </footer>
      </div>
    </main>
  );
}
