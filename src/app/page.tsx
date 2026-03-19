"use client";

import { useEffect, useState, useMemo } from "react";

type InventoryItem = {
  accountName: string;
  accountId: string;
  service: string;
  name: string;
  id: string;
  host: string;
  status: string;

  description?: string;
  internalSoftwares?: string;
  operatingSystem?: string;
  responsibleCompany?: string;
};

export default function Home() {
  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [osFilter, setOsFilter] = useState("all");

  const [selected, setSelected] = useState<string[]>([]);

  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [runningCommand, setRunningCommand] = useState(false);

  /* ================= FETCH ================= */

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    const interval = setInterval(fetchInventory, 60000);
    return () => clearInterval(interval);
  }, []);

  /* ================= META SAVE ================= */

  const saveMeta = async (
    id: string,
    description?: string,
    internalSoftwares?: string
  ) => {
    await fetch("/api/inventory/meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, description, internalSoftwares }),
    });
  };

  /* ================= STATUS ================= */

  const healthyStates = ["running", "available", "active"];

  const getStatusStyle = (status: string) => {
    return healthyStates.includes(status)
      ? "bg-green-500/20 text-green-400"
      : "bg-red-500/20 text-red-400";
  };

  /* ================= DYNAMIC LISTS ================= */

  const services = useMemo(() => {
    return Array.from(new Set(data.map((i) => i.service))).sort();
  }, [data]);

  const accounts = useMemo(() => {
    return Array.from(new Set(data.map((i) => i.accountName))).sort();
  }, [data]);

  const operatingSystems = useMemo(() => {
    return Array.from(
      new Set(data.map((i) => i.operatingSystem || "N/A"))
    ).sort();
  }, [data]);

  /* ================= FILTER ================= */

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase());

      const matchesService =
        serviceFilter === "all" || item.service === serviceFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "running" &&
          healthyStates.includes(item.status)) ||
        (statusFilter === "stopped" &&
          !healthyStates.includes(item.status));

      const matchesAccount =
        accountFilter === "all" || item.accountName === accountFilter;

      const matchesOS =
        osFilter === "all" ||
        (item.operatingSystem || "N/A") === osFilter;

      return (
        matchesSearch &&
        matchesService &&
        matchesStatus &&
        matchesAccount &&
        matchesOS
      );
    });
  }, [
    data,
    search,
    serviceFilter,
    statusFilter,
    accountFilter,
    osFilter,
  ]);

  /* ================= METRICS ================= */

  const total = filteredData.length;

  const running = filteredData.filter((i) =>
    healthyStates.includes(i.status)
  ).length;

  const stopped = total - running;

  const hasFilters =
    search ||
    serviceFilter !== "all" ||
    statusFilter !== "all" ||
    accountFilter !== "all" ||
    osFilter !== "all";

  /* ================= SELECT ================= */

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id]
    );
  };

  const allEC2Ids = filteredData
    .filter((i) => i.service === "EC2")
    .map((i) => i.id);

  const isAllSelected =
    allEC2Ids.length > 0 &&
    allEC2Ids.every((id) => selected.includes(id));

  const toggleSelectAll = () => {
    setSelected(isAllSelected ? [] : allEC2Ids);
  };

  /* ================= COMMAND ================= */

  const runCommand = async () => {
    if (!command) return;

    const instances = data
      .filter((i) => selected.includes(i.id) && i.service === "EC2")
      .map((i) => ({
        instanceId: i.id,
        accountId: i.accountId,
      }));

    if (!instances.length) {
      alert("Select EC2 instances first");
      return;
    }

    setRunningCommand(true);
    setLogs(["Starting execution...\n"]);

    try {
      const res = await fetch("/api/ec2/run-command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ instances, command }),
      });

      const result = await res.json();

      const newLogs = result.map(
        (r: any) => `[${r.accountId}] ${r.instanceId}

${r.output || r.error}

---------------------------`
      );

      setLogs(newLogs);
    } catch {
      setLogs(["Execution failed"]);
    } finally {
      setRunningCommand(false);
    }
  };

  /* ================= UI ================= */

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-8">
      <div className="max-w-[95%] mx-auto">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">MC Inventory</h1>

          <button
            onClick={fetchInventory}
            className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* METRICS */}
        <div className="grid grid-cols-3 gap-6 mb-6">
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

        {/* ACTIVE FILTER INFO */}
        {hasFilters && (
          <div className="mb-4 text-sm text-gray-400">
            Showing {total} filtered resources
          </div>
        )}

        {/* FILTERS */}
        <div className="flex flex-wrap gap-4 mb-6">

          <input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg w-64"
          />

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg"
          >
            <option value="all">All Services</option>
            {services.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg"
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="stopped">Stopped</option>
          </select>

          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg"
          >
            <option value="all">All Accounts</option>
            {accounts.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>

          <select
            value={osFilter}
            onChange={(e) => setOsFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg"
          >
            <option value="all">All OS</option>
            {operatingSystems.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* COMMAND */}
        <div className="bg-gray-800 p-6 rounded-xl mb-8">
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="w-full bg-gray-900 p-3 rounded mb-4"
          />

          <button
            onClick={runCommand}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded"
          >
            {runningCommand ? "Running..." : "Execute"}
          </button>
        </div>

        {/* TABLE */}
        <div className="bg-gray-800 rounded-xl overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700 text-xs">
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
              {filteredData.map((item) => (
                <tr key={item.id} className="border-t border-gray-700">
                  <td className="p-3 text-center">
                    {item.service === "EC2" ? (
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="p-3">{item.accountName}</td>

                  <td className="p-3">
                    <span className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full text-xs">
                      {item.service}
                    </span>
                  </td>

                  <td className="p-3">{item.name}</td>
                  <td className="p-3">{item.operatingSystem || "N/A"}</td>
                  <td className="p-3">{item.id}</td>
                  <td className="p-3">{item.host}</td>

                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${getStatusStyle(item.status)}`}
                    >
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
          <div className="mt-10 bg-black p-6 rounded-xl text-green-400 font-mono">
            <pre>{logs.join("\n")}</pre>
          </div>
        )}
      </div>
    </main>
  );
}