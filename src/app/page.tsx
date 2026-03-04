"use client";

import { useEffect, useState } from "react";

type InventoryItem = {
  service: string;
  name: string;
  id: string;
  host: string;
  status: string;
};

export default function Home() {
  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

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
  }, []);

  const total = data.length;
  const running = data.filter((i) => i.status === "running").length;
  const stopped = data.filter((i) => i.status !== "running").length;

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-10">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight">
            MC Inventory
          </h1>

          <button
            onClick={fetchInventory}
            className="bg-blue-600 hover:bg-blue-700 transition px-5 py-2 rounded-lg font-medium shadow-lg"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* DASHBOARD CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
            <p className="text-gray-400 text-sm">Total Resources</p>
            <h2 className="text-3xl font-bold">{total}</h2>
          </div>

          <div className="bg-green-900/40 p-6 rounded-xl shadow-lg">
            <p className="text-green-400 text-sm">Running</p>
            <h2 className="text-3xl font-bold">{running}</h2>
          </div>

          <div className="bg-red-900/40 p-6 rounded-xl shadow-lg">
            <p className="text-red-400 text-sm">Stopped / Other</p>
            <h2 className="text-3xl font-bold">{stopped}</h2>
          </div>
        </div>

        {/* TABLE */}
        <div className="bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700 text-gray-300 uppercase text-xs">
              <tr>
                <th className="p-4 text-left">Service</th>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">ID</th>
                <th className="p-4 text-left">Host/IP</th>
                <th className="p-4 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr
                  key={index}
                  className="border-t border-gray-700 hover:bg-gray-700/50 transition"
                >
                  <td className="p-4">{item.service}</td>
                  <td className="p-4">{item.name}</td>
                  <td className="p-4 text-gray-400">{item.id}</td>
                  <td className="p-4">{item.host}</td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        item.status === "running"
                          ? "bg-green-600/20 text-green-400"
                          : "bg-red-600/20 text-red-400"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.length === 0 && !loading && (
            <div className="p-8 text-center text-gray-400">
              No resources found.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}