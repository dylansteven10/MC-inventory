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
};

export default function Home() {

  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");

  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const [selected, setSelected] = useState<string[]>([]);

  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [runningCommand, setRunningCommand] = useState(false);

  /* =========================
     FETCH INVENTORY
  ========================= */

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

  /* =========================
     STATUS STYLE
  ========================= */

  const healthyStates = ["running", "available", "active"];

  const getStatusStyle = (status: string) => {

    if (healthyStates.includes(status)) {
      return "bg-green-600/20 text-green-400";
    }

    return "bg-red-600/20 text-red-400";

  };

  /* =========================
     METRICS
  ========================= */

  const total = data.length;

  const running = data.filter((i) =>
    healthyStates.includes(i.status)
  ).length;

  const stopped = total - running;

  /* =========================
     FILTER
  ========================= */

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

  /* =========================
     PAGINATION
  ========================= */

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const paginatedData = filteredData.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  /* =========================
     EXPORT CSV
  ========================= */

  const exportCSV = () => {

    if (!data.length) return;

    const headers = Object.keys(data[0]).join(",");

    const rows = data
      .map((row) => Object.values(row).join(","))
      .join("\n");

    const csv = `${headers}\n${rows}`;

    const blob = new Blob([csv], { type: "text/csv" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "mc-inventory.csv";
    a.click();

  };

  /* =========================
     SELECT EC2
  ========================= */

  const toggleSelect = (id: string) => {

    if (selected.includes(id)) {

      setSelected(selected.filter((i) => i !== id));

    } else {

      setSelected([...selected, id]);

    }

  };

  /* =========================
     RUN COMMAND MULTI EC2
  ========================= */

  const runCommand = async () => {

    if (!command) return;

    const instances = data
      .filter((i) => selected.includes(i.id) && i.service === "EC2")
      .map((i) => ({
        instanceId: i.id,
        accountId: i.accountId
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
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          instances,
          command
        })

      });

      const result = await res.json();

      const newLogs = result.map((r: any) =>

        `[${r.accountId}] ${r.instanceId}

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

  return (

    <main className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-10">

      <div className="max-w-7xl mx-auto">

        {/* HEADER */}

        <div className="flex justify-between items-center mb-10">

          <h1 className="text-4xl font-bold">
            MC Inventory
          </h1>

          <div className="flex gap-3">

            <button
              onClick={exportCSV}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
            >
              Export CSV
            </button>

            <button
              onClick={fetchInventory}
              className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

          </div>

        </div>

        {/* DASHBOARD */}

        <div className="grid grid-cols-3 gap-6 mb-10">

          <div className="bg-gray-800 p-6 rounded-xl">
            <p className="text-gray-400 text-sm">Total Resources</p>
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

        <div className="flex gap-4 mb-6">

          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
          />

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
          >

            <option value="all">All</option>
            <option value="EC2">EC2</option>
            <option value="RDS">RDS</option>
            <option value="S3">S3</option>

          </select>

        </div>

        {/* COMMAND PANEL */}

        <div className="bg-gray-800 p-6 rounded-xl mb-8">

          <h2 className="text-lg mb-3">Run Command on Selected EC2</h2>

          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Example: docker ps"
            className="w-full bg-gray-900 p-3 rounded mb-4"
          />

          <button
            onClick={runCommand}
            className="bg-purple-600 px-4 py-2 rounded"
          >
            {runningCommand ? "Running..." : "Execute"}
          </button>

        </div>

        {/* TABLE */}

        <div className="bg-gray-800 rounded-xl overflow-hidden">

          <table className="min-w-full text-sm">

            <thead className="bg-gray-700 text-xs">

              <tr>

                <th className="p-4">Select</th>
                <th className="p-4">Account</th>
                <th className="p-4">Service</th>
                <th className="p-4">Name</th>
                <th className="p-4">ID</th>
                <th className="p-4">Host</th>
                <th className="p-4">Status</th>

              </tr>

            </thead>

            <tbody>

              {paginatedData.map((item, index) => (

                <tr key={index} className="border-t border-gray-700">

                  <td className="p-4">

                    {item.service === "EC2" && (

                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />

                    )}

                  </td>

                  <td className="p-4">{item.accountName}</td>
                  <td className="p-4">{item.service}</td>
                  <td className="p-4">{item.name}</td>
                  <td className="p-4 text-gray-400">{item.id}</td>
                  <td className="p-4">{item.host}</td>

                  <td className="p-4">

                    <span
                      className={`px-3 py-1 rounded-full text-xs ${getStatusStyle(item.status)}`}
                    >
                      {item.status}
                    </span>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

        {/* LOG OUTPUT */}

        {logs.length > 0 && (

          <div className="mt-10 bg-black p-6 rounded-xl text-green-400 font-mono text-sm">

            <h2 className="text-white mb-4">Command Logs</h2>

            <pre>

{logs.join("\n")}

            </pre>

          </div>

        )}

      </div>

    </main>

  );

}