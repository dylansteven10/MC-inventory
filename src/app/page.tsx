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
  const [statusFilter, setStatusFilter] = useState("all");

  const [sortField, setSortField] = useState<keyof InventoryItem | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  /* =========================
     FETCH
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

    const interval = setInterval(fetchInventory, 60000); // auto refresh

    return () => clearInterval(interval);

  }, []);

  /* =========================
     STATUS STYLE
  ========================= */

  const healthyStates = ["running", "available"];
  const warningStates = ["stopped", "terminated"];

  const getStatusStyle = (status: string) => {

    if (healthyStates.includes(status)) {
      return "bg-green-600/20 text-green-400";
    }

    if (warningStates.includes(status)) {
      return "bg-yellow-600/20 text-yellow-400";
    }

    return "bg-red-600/20 text-red-400";

  };

  /* =========================
     DASHBOARD METRICS
  ========================= */

  const total = data.length;

  const running = data.filter((i) =>
    healthyStates.includes(i.status)
  ).length;

  const stopped = data.filter(
    (i) => !healthyStates.includes(i.status)
  ).length;

  /* =========================
     SORT
  ========================= */

  const handleSort = (field: keyof InventoryItem) => {

    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }

  };

  const getSortArrow = (field: keyof InventoryItem) => {

    if (sortField !== field) return "↕";

    return sortDirection === "asc" ? "↑" : "↓";

  };

  /* =========================
     FILTER + SORT
  ========================= */

  const filteredData = useMemo(() => {

    const filtered = data.filter((item) => {

      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase()) ||
        item.service.toLowerCase().includes(search.toLowerCase()) ||
        item.host.toLowerCase().includes(search.toLowerCase());

      const matchesService =
        serviceFilter === "all" || item.service === serviceFilter;

      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;

      return matchesSearch && matchesService && matchesStatus;

    });

    if (!sortField) return filtered;

    return filtered.sort((a, b) => {

      const aValue = a[sortField]?.toString().toLowerCase();
      const bValue = b[sortField]?.toString().toLowerCase();

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;

      return 0;

    });

  }, [data, search, serviceFilter, statusFilter, sortField, sortDirection]);

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

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-10">

      <div className="max-w-7xl mx-auto">

        {/* HEADER */}

        <div className="flex justify-between items-center mb-10">

          <h1 className="text-4xl font-bold tracking-tight">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

          <div className="bg-gray-800 p-6 rounded-xl">
            <p className="text-gray-400 text-sm">Total Resources</p>
            <h2 className="text-3xl font-bold">{total}</h2>
          </div>

          <div className="bg-green-900/40 p-6 rounded-xl">
            <p className="text-green-400 text-sm">Running / Healthy</p>
            <h2 className="text-3xl font-bold">{running}</h2>
          </div>

          <div className="bg-red-900/40 p-6 rounded-xl">
            <p className="text-red-400 text-sm">Stopped / Other</p>
            <h2 className="text-3xl font-bold">{stopped}</h2>
          </div>

        </div>

        {/* FILTERS */}

        <div className="flex flex-wrap gap-4 mb-6">

          <input
            type="text"
            placeholder="Search resources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
          />

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
          >
            <option value="all">All Services</option>
            <option value="EC2">EC2</option>
            <option value="RDS">RDS</option>
            <option value="S3">S3</option>
            <option value="ECS">ECS</option>
            <option value="CloudFront">CloudFront</option>
            <option value="LoadBalancer">LoadBalancer</option>
            <option value="VPC">VPC</option>
            <option value="Subnet">Subnet</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="available">Available</option>
            <option value="stopped">Stopped</option>
          </select>

        </div>

        {/* TABLE */}

        <div className="bg-gray-800 rounded-xl overflow-hidden">

          <table className="min-w-full text-sm">

            <thead className="bg-gray-700 text-gray-300 uppercase text-xs">

              <tr>

                <th onClick={() => handleSort("accountName")} className="p-4 cursor-pointer">
                  Account Name {getSortArrow("accountName")}
                </th>

                <th onClick={() => handleSort("accountId")} className="p-4 cursor-pointer">
                  Account ID {getSortArrow("accountId")}
                </th>

                <th onClick={() => handleSort("service")} className="p-4 cursor-pointer">
                  Service {getSortArrow("service")}
                </th>

                <th onClick={() => handleSort("name")} className="p-4 cursor-pointer">
                  Name {getSortArrow("name")}
                </th>

                <th onClick={() => handleSort("id")} className="p-4 cursor-pointer">
                  ID {getSortArrow("id")}
                </th>

                <th onClick={() => handleSort("host")} className="p-4 cursor-pointer">
                  Host/IP {getSortArrow("host")}
                </th>

                <th onClick={() => handleSort("status")} className="p-4 cursor-pointer">
                  Status {getSortArrow("status")}
                </th>

              </tr>

            </thead>

            <tbody>

              {paginatedData.map((item, index) => (

                <tr key={index} className="border-t border-gray-700 hover:bg-gray-700/50">

                  <td className="p-4 text-blue-400">{item.accountName}</td>
                  <td className="p-4 text-blue-400">{item.accountId}</td>
                  <td className="p-4">{item.service}</td>
                  <td className="p-4">{item.name}</td>
                  <td className="p-4 text-gray-400">{item.id}</td>
                  <td className="p-4">{item.host}</td>

                  <td className="p-4">

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(item.status)}`}
                    >
                      {item.status}
                    </span>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

        {/* PAGINATION */}

        <div className="flex justify-center gap-3 mt-6">

          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1 bg-gray-700 rounded disabled:opacity-40"
          >
            Prev
          </button>

          <span className="px-3 py-1">
            Page {page} / {totalPages}
          </span>

          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1 bg-gray-700 rounded disabled:opacity-40"
          >
            Next
          </button>

        </div>

      </div>

    </main>
  );
}