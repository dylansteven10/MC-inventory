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

  const [selected, setSelected] = useState<string[]>([]);

  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [runningCommand, setRunningCommand] = useState(false);

  const [saving, setSaving] = useState<string | null>(null);

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

  /* ================= SAVE META ================= */

  const saveMeta = async (
    id: string,
    description?: string,
    internalSoftwares?: string
  ) => {
    setSaving(id);

    await fetch("/api/inventory/meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, description, internalSoftwares }),
    });

    setSaving(null);
  };

  /* ================= FILTER ================= */

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase());

      const matchesService =
        serviceFilter === "all" || item.service === serviceFilter;

      return matchesSearch && matchesService;
    });
  }, [data, search, serviceFilter]);

  /* ================= STATUS ================= */

  const healthyStates = ["running", "available", "active"];

  const getStatusStyle = (status: string) => {
    return healthyStates.includes(status)
      ? "bg-green-500/20 text-green-400"
      : "bg-red-500/20 text-red-400";
  };

  /* ================= METRICS ================= */

  const total = data.length;
  const running = data.filter((i) =>
    healthyStates.includes(i.status)
  ).length;
  const stopped = total - running;

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
    if (isAllSelected) {
      setSelected([]);
    } else {
      setSelected(allEC2Ids);
    }
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
    } catch (error) {
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
          <h1 className="text-4xl font-bold tracking-tight">
            MC Inventory
          </h1>

          <button
            onClick={fetchInventory}
            className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg transition"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* METRICS */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="bg-gray-800 p-6 rounded-xl shadow">
            <p className="text-gray-400 text-sm">Total</p>
            <h2 className="text-3xl font-bold">{total}</h2>
          </div>

          <div className="bg-green-900/40 p-6 rounded-xl shadow">
            <p className="text-green-400 text-sm">Running</p>
            <h2 className="text-3xl font-bold">{running}</h2>
          </div>

          <div className="bg-red-900/40 p-6 rounded-xl shadow">
            <p className="text-red-400 text-sm">Stopped</p>
            <h2 className="text-3xl font-bold">{stopped}</h2>
          </div>
        </div>

        {/* FILTERS */}
        <div className="flex gap-4 mb-6">
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
            <option value="all">All</option>
            <option value="EC2">EC2</option>
            <option value="S3">S3</option>
            <option value="RDS">RDS</option>
          </select>
        </div>

        {/* COMMAND */}
        <div className="bg-gray-800 p-6 rounded-xl mb-8">
          <h2 className="mb-3 text-lg">Run Command</h2>

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
        <div className="bg-gray-800 rounded-xl overflow-auto shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700 sticky top-0 text-xs uppercase">
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
                <th className="p-3">Description</th>
                <th className="p-3">OS</th>
                <th className="p-3">Softwares</th>
                <th className="p-3">Company</th>
                <th className="p-3">ID</th>
                <th className="p-3">Host</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>

            <tbody>
              {filteredData.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-gray-700 hover:bg-gray-700/40 transition"
                >
                  <td className="p-3 text-center">
                    {item.service === "EC2" ? (
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>

                  <td className="p-3">{item.accountName}</td>
                  <td className="p-3">{item.service}</td>
                  <td className="p-3">{item.name}</td>

                  {/* DESCRIPTION */}
                  <td className="p-3">
                    <input
                      defaultValue={item.description || ""}
                      onBlur={(e) =>
                        saveMeta(
                          item.id,
                          e.target.value,
                          item.internalSoftwares
                        )
                      }
                      className="bg-gray-700 px-2 py-1 rounded w-48"
                    />
                  </td>

                  {/* OS */}
                  <td className="p-3 text-gray-300">
                    {item.operatingSystem || "N/A"}
                  </td>

                  {/* SOFTWARES */}
                  <td className="p-3">
                    <input
                      defaultValue={item.internalSoftwares || ""}
                      onBlur={(e) =>
                        saveMeta(
                          item.id,
                          item.description,
                          e.target.value
                        )
                      }
                      className="bg-gray-700 px-2 py-1 rounded w-48"
                    />
                  </td>

                  {/* COMPANY */}
                  <td className="p-3 text-blue-400">
                    {item.responsibleCompany || "N/A"}
                  </td>

                  <td className="p-3 text-gray-400">{item.id}</td>
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
          <div className="mt-10 bg-black p-6 rounded-xl font-mono text-green-400 text-sm">
            <h2 className="text-white mb-4">Logs</h2>
            <pre>{logs.join("\n")}</pre>
          </div>
        )}
      </div>
    </main>
  );
}