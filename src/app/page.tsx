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

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");

  const [serviceFilter, setServiceFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [osFilter, setOsFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const [selected, setSelected] = useState<string[]>([]);

  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [runningCommand, setRunningCommand] = useState(false);

  // Marcar cuando el componente está montado en cliente
  useEffect(() => {
    setIsMounted(true);
  }, []);

  /* ================= AUTH ================= */

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  /* ================= FETCH ================= */

  const fetchInventory = async () => {
    setLoading(true);
    const res = await fetch("/api/inventory");
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchInventory();
    }
  }, [status]);

  /* ================= HELPER FUNCTIONS (MOVED BEFORE useMemo) ================= */

  const normalizeService = (service: string) => {
    return service.trim().toUpperCase();
  };

  const normalizeStatus = (status: string) => {
    const s = status.toLowerCase();
    if (["running", "available", "active"].includes(s)) return "running";
    if (["stopped", "terminated"].includes(s)) return "stopped";
    return s;
  };

  const getStatusStyle = (status: string) => {
    const s = status.toLowerCase();

    if (["running", "available", "active"].includes(s)) {
      return "bg-green-900/40 text-green-400";
    }

    if (["stopped", "terminated"].includes(s)) {
      return "bg-red-900/40 text-red-400";
    }

    return "bg-gray-700 text-gray-300";
  };

  /* ================= LISTS ================= */

  const services = useMemo(
    () => [...new Set(data.map(i => normalizeService(i.service)))].sort(),
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

  const idToNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    data.forEach(i => {
      map[i.id] = i.name;
    });
    return map;
  }, [data]);

  /* ================= FILTER ================= */

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase());

      // ✅ FIX SERVICE REAL
      const normalizedService = normalizeService(item.service);

      const matchesService =
        serviceFilter.length === 0 ||
        serviceFilter
          .map(s => normalizeService(s))
          .includes(normalizedService);

      const matchesAccount =
        accountFilter.length === 0 ||
        accountFilter.includes(item.accountName);

      const matchesOS =
        osFilter.length === 0 ||
        osFilter.includes(item.operatingSystem || "N/A");

      // ✅ FIX STATUS REAL
      const normalizedStatus = normalizeStatus(item.status);

      const matchesStatus =
        statusFilter.length === 0 ||
        statusFilter.includes(normalizedStatus);

      return (
        matchesSearch &&
        matchesService &&
        matchesAccount &&
        matchesOS &&
        matchesStatus
      );
    });
  }, [data, search, serviceFilter, accountFilter, osFilter, statusFilter]);

  /* ================= METRICS ================= */

  const total = filteredData.length;

  const running = filteredData.filter(i =>
    ["running", "available", "active"].includes(i.status)
  ).length;

  const stopped = total - running;

  /* ================= CLEAR ================= */

  const clearFilters = () => {
    setSearch("");
    setServiceFilter([]);
    setAccountFilter([]);
    setOsFilter([]);
    setStatusFilter([]);
  };

  const clearLogs = () => setLogs([]);
  const clearCommand = () => setCommand("");

  /* ================= EXPORT CSV ================= */

  const exportCSV = (rows: InventoryItem[], filename: string) => {
    const headers = [
      "Account",
      "Account ID",
      "Service",
      "Name",
      "Instance ID",
      "Host",
      "OS",
      "Status"
    ];

    const csv = [
      headers.join(","),
      ...rows.map(r =>
        [
          r.accountName,
          r.accountId,
          r.service,
          r.name,
          r.id,
          r.host,
          r.operatingSystem || "N/A",
          r.status
        ]
          .map(v => `"${v}"`)
          .join(",")
      )
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  /* ================= SELECT ================= */

  const toggleSelect = (id: string) => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const allEC2Ids = filteredData
    .filter(i => i.service === "EC2")
    .map(i => i.id);

  const isAllSelected =
    allEC2Ids.length > 0 &&
    allEC2Ids.every(id => selected.includes(id));

  const toggleSelectAll = () => {
    setSelected(isAllSelected ? [] : allEC2Ids);
  };

  /* ================= COMMAND ================= */

  const runCommand = async () => {
    if (!command) return;

    const instances = data
      .filter(i =>
        selected.includes(i.id) &&
        i.service === "EC2" &&
        i.status === "running"
      )
      .map(i => ({
        instanceId: i.id,
        accountId: i.accountId
      }));

    if (!instances.length) {
      alert("Only running EC2 instances allowed");
      return;
    }

    setRunningCommand(true);
    setLogs(["🚀 Starting execution...\n"]);

    try {
      const res = await fetch("/api/ec2/run-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances, command })
      });

      const result = await res.json();

      const newLogs = result.map((r: any) => {
        const displayName = idToNameMap[r.instanceId] || r.instanceId;

        let log = `[${r.accountId}] ${displayName}\n\n`;

        if (r.output) log += `${r.output}\n`;
        if (r.error && !r.output) log += `${r.error}\n`;

        log += "\n---------------------------\n";

        return log;
      });

      setLogs(newLogs);
    } catch {
      setLogs(["❌ Execution failed"]);
    } finally {
      setRunningCommand(false);
    }
  };

  /* ================= UI HELPERS ================= */

  const filterChips = (
    list: string[],
    state: string[],
    setState: any
  ) => (
    <div className="flex flex-wrap gap-2">
      {list.map(item => {
        const active = state.includes(item);

        return (
          <button
            key={item}
            onClick={() =>
              setState((prev: string[]) =>
                prev.includes(item)
                  ? prev.filter(i => i !== item)
                  : [...prev, item]
              )
            }
            className={`px-3 py-1 rounded-full text-xs border transition
              ${active
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );

  // Si no está montado en cliente, mostrar loading
  if (!isMounted) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-8">
        <div className="max-w-[95%] mx-auto">
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-400">Cargando inventario...</p>
          </div>
        </div>
      </main>
    );
  }

  /* ================= UI ================= */

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-8">
      <div className="max-w-[95%] mx-auto">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">MC Inventory</h1>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold">
                {session?.user?.name}
              </p>
              <p className="text-xs text-gray-400">
                {session?.user?.email}
              </p>
            </div>

            <button onClick={() => signOut({ callbackUrl: "/login" })} className="raise-btn border-red-500 text-red-400">Logout</button>
            <button onClick={() => exportCSV(data, "inventory_all.csv")} className="raise-btn border-green-500 text-green-400">Export All</button>
            <button onClick={() => exportCSV(filteredData, "inventory_filtered.csv")} className="raise-btn border-green-700 text-green-500">Export Filter</button>
            <button onClick={fetchInventory} className="raise-btn border-blue-500 text-blue-400">{loading ? "Refreshing..." : "Refresh"}</button>
          </div>
        </div>

        {/* METRICS */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 p-6 rounded-xl">
            <p className="text-gray-400 text-sm">Total</p>
            <h2 className="text-3xl font-bold">{total}</h2>
          </div>

          <div className="bg-green-900/40 p-6 rounded-xl">
            <p className="text-green-400 text-sm">Running</p>
            <h2 className="text-3xl font-bold">{running}</h2>
          </div>

          <div className="bg-red-900/40 p-6 rounded-xl">
            <p className="text-red-400 text-sm">Stopped</p>
            <h2 className="text-3xl font-bold">{stopped}</h2>
          </div>
        </div>

        {/* FILTERS */}
        <div className="bg-gray-800 p-6 rounded-xl mb-8 space-y-6">
          <input
            placeholder="Search by name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-900 px-4 py-2 rounded w-full"
          />

          <div>
            <p className="text-sm text-gray-400 mb-2">Service</p>
            {filterChips(services, serviceFilter, setServiceFilter)}
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Account</p>
            {filterChips(accounts, accountFilter, setAccountFilter)}
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Operating System</p>
            {filterChips(osList, osFilter, setOsFilter)}
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Status</p>
            {filterChips(["running", "stopped"], statusFilter, setStatusFilter)}
          </div>

          <button
            onClick={clearFilters}
            className="raise-btn border-orange-500 text-orange-400"
          >
            Clear Filters
          </button>
        </div>

        {/* COMMAND */}
        <div className="bg-gray-800 p-6 rounded-xl mb-8">
          <h2 className="mb-3 text-lg">Execute Command (EC2 only)</h2>

          <textarea
            value={command}
            onChange={e => setCommand(e.target.value)}
            className="w-full bg-gray-900 p-3 rounded mb-4"
          />

          <div className="flex gap-3">
            <button
              onClick={runCommand}
              disabled={runningCommand}
              className="raise-btn border-purple-500 text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runningCommand ? "Running..." : "Execute"}
            </button>

            <button
              onClick={clearCommand}
              className="raise-btn border-gray-500 text-gray-400"
            >
              Clear Command
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="bg-gray-800 rounded-xl overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700 text-xs uppercase">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-3">Account</th>
                <th className="p-3">Service</th>
                <th className="p-3">Name</th>
                <th className="p-3">OS</th>
                <th className="p-3">ID</th>
                <th className="p-3">Host</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>

            <tbody>
              {filteredData.map(item => (
                <tr key={item.id} className="border-t border-gray-700 hover:bg-gray-700/40">
                  <td className="p-3 text-center">
                    {item.service === "EC2" && (
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    )}
                  </td>

                  <td className="p-3">{item.accountName}</td>
                  <td className="p-3">{item.service}</td>
                  <td className="p-3">{item.name}</td>
                  <td className="p-3">{item.operatingSystem || "N/A"}</td>
                  <td className="p-3 text-gray-400">{item.id}</td>
                  <td className="p-3">{item.host}</td>

                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusStyle(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* LOGS */}
        {logs.length > 0 && (
          <div className="mt-10 bg-black p-6 rounded-xl text-green-400 font-mono text-sm">
            <div className="flex justify-between mb-4">
              <h3>Logs</h3>
              <button
                onClick={clearLogs}
                className="raise-btn border-red-500 text-red-400"
              >
                Clear Logs
              </button>
            </div>
            <pre>{logs.join("\n")}</pre>
          </div>
        )}

      </div>

      {/* RAISE STYLE */}
      <style jsx global>{`
        .raise-btn {
          background: transparent;
          border: 2px solid;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: 0.25s;
        }

        .raise-btn:hover:not(:disabled) {
          box-shadow: 0 0.5em 0.5em -0.4em currentColor;
          transform: translateY(-0.25em);
          color: white;
        }

        .raise-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </main>
  );
}