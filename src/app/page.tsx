"use client";

import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Database,
  Shield,
  Cloud,
  X
} from "lucide-react";

import { InventoryItem } from "@/types/inventory";

import InventoryTable from "@/components/inventory/InventoryTable";
import InventoryCards from "@/components/inventory/InventoryCards";
import MetricsCards from "@/components/inventory/MetricsCards";
import ResourceModal from "@/components/inventory/ResourceModal";

import {
  exportCSV
} from "@/lib/inventory/exportCsv";

type SortField =
  | "name"
  | "provider"
  | "service"
  | "status"
  | "host"
  | "account";

export default function Home() {

  const [data, setData] =
    useState<InventoryItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [mobileView, setMobileView] =
    useState(false);

  const [selectedItem, setSelectedItem] =
    useState<InventoryItem | null>(null);

  const [search, setSearch] =
    useState("");

  const [selectedClients, setSelectedClients] =
    useState<string[]>([]);

  const [selectedProjects, setSelectedProjects] =
    useState<string[]>([]);

  const [selectedAccounts, setSelectedAccounts] =
    useState<string[]>([]);

  const [onlyWithoutTags, setOnlyWithoutTags] =
    useState(false);

  const [sortField, setSortField] =
    useState<SortField>("name");

  const [sortDirection, setSortDirection] =
    useState<"asc" | "desc">("asc");

  useEffect(() => {

    const load = async () => {

      try {

        setLoading(true);

        const response =
          await fetch("/api/inventory");

        const json =
          await response.json();

        setData(json);

      } catch (error) {

        console.error(
          "Inventory fetch error:",
          error
        );

      } finally {

        setLoading(false);

      }

    };

    load();

  }, []);

  useEffect(() => {

    const check = () =>
      setMobileView(
        window.innerWidth < 768
      );

    check();

    window.addEventListener(
      "resize",
      check
    );

    return () =>
      window.removeEventListener(
        "resize",
        check
      );

  }, []);

  const clients = useMemo(() => {

    return [

      ...new Set(

        data
          .map(

            (i) =>

              i.tags?.cliente ||
              i.tags?.Cliente

          )
          .filter(Boolean)

      )

    ].sort();

  }, [data]);

  const projects = useMemo(() => {

    return [

      ...new Set(

        data
          .map(

            (i) =>

              i.tags?.proyecto ||
              i.tags?.Proyecto

          )
          .filter(Boolean)

      )

    ].sort();

  }, [data]);

  const accounts = useMemo(() => {

    return [

      ...new Set(

        data.map(
          (i) => i.accountName
        )

      )

    ].sort();

  }, [data]);

  const filteredData = useMemo(() => {

    const filtered =
      data.filter((item) => {

        const q =
          search.toLowerCase();

        const tagText =
          Object.entries(
            item.tags || {}
          )
            .map(([k, v]) => `${k} ${v}`)
            .join(" ")
            .toLowerCase();

        const searchMatch =

          item.name
            .toLowerCase()
            .includes(q)

          ||

          item.id
            .toLowerCase()
            .includes(q)

          ||

          item.host
            .toLowerCase()
            .includes(q)

          ||

          tagText.includes(q);

        const client =
          item.tags?.cliente ||
          item.tags?.Cliente;

        const project =
          item.tags?.proyecto ||
          item.tags?.Proyecto;

        const clientMatch =

          selectedClients.length === 0 ||

          selectedClients.includes(
            client || ""
          );

        const projectMatch =

          selectedProjects.length === 0 ||

          selectedProjects.includes(
            project || ""
          );

        const accountMatch =

          selectedAccounts.length === 0 ||

          selectedAccounts.includes(
            item.accountName
          );

        const noTagsMatch =

          !onlyWithoutTags ||

          !item.tags ||

          Object.keys(item.tags).length === 0;

        return (

          searchMatch &&
          clientMatch &&
          projectMatch &&
          accountMatch &&
          noTagsMatch

        );

      });

    filtered.sort((a, b) => {

      const direction =
        sortDirection === "asc"
          ? 1
          : -1;

      let aValue = "";
      let bValue = "";

      switch (sortField) {

        case "provider":

          aValue = a.provider || "";
          bValue = b.provider || "";

          break;

        case "service":

          aValue = a.service;
          bValue = b.service;

          break;

        case "status":

          aValue = a.status;
          bValue = b.status;

          break;

        case "host":

          aValue = a.host;
          bValue = b.host;

          break;

        case "account":

          aValue = a.accountName;
          bValue = b.accountName;

          break;

        default:

          aValue = a.name;
          bValue = b.name;

      }

      return (
        aValue.localeCompare(bValue) *
        direction
      );

    });

    return filtered;

  }, [

    data,
    search,
    selectedClients,
    selectedProjects,
    selectedAccounts,
    onlyWithoutTags,
    sortField,
    sortDirection

  ]);

  const handleSort = (
    field: SortField
  ) => {

    if (sortField === field) {

      setSortDirection((prev) =>

        prev === "asc"
          ? "desc"
          : "asc"

      );

      return;

    }

    setSortField(field);

    setSortDirection("asc");

  };

  if (loading) {

    return (

      <div
        className="
          min-h-screen
          flex
          items-center
          justify-center
          relative
          overflow-hidden
        "
      >

        <div
          className="
            absolute
            inset-0
            bg-black/40
            backdrop-blur-3xl
          "
        />

        <div
          className="
            relative
            z-10
            text-center
          "
        >

          <div
            className="
              w-28
              h-28
              rounded-3xl
              mx-auto
              mb-8
              animate-glowPulse
              flex
              items-center
              justify-center
              text-white
              text-4xl
              font-bold
              shadow-2xl
            "
            style={{
              background:
                "linear-gradient(135deg, var(--gradient-start), var(--gradient-end))"
            }}
          >
            MC
          </div>

          <h1
            className="
              text-5xl
              font-bold
              mb-3
            "
          >
            MC Inventory
          </h1>

          <p
            className="
              text-[var(--text-secondary)]
              text-lg
              mb-10
            "
          >
            Cargando servicios del inventario cloud...
          </p>

          <div
            className="
              flex
              justify-center
              gap-6
              text-sm
            "
          >

            <LoadingCard
              icon={<Cloud size={18} />}
              text="AWS"
            />

            <LoadingCard
              icon={<Cloud size={18} />}
              text="HUAWEI"
            />


          </div>

        </div>

      </div>

    );

  }

  return (

    <main
      className="min-h-screen p-6"
      style={{
        background:
          "linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-card) 100%)"
      }}
    >

      <div className="mb-8">

        <div className="flex items-center gap-4 mb-3">

          <div
            className="
              w-14
              h-14
              rounded-2xl
              flex
              items-center
              justify-center
              text-white
              text-xl
              font-bold
            "
            style={{
              background:
                "linear-gradient(135deg, var(--gradient-start), var(--gradient-end))"
            }}
          >
            MC
          </div>

          <div>

            <h1
              className="
                text-4xl
                font-bold
              "
              style={{
                background:
                  "linear-gradient(135deg, var(--text-primary), var(--text-secondary))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent"
              }}
            >
              MC Inventory
            </h1>

            <p className="text-[var(--text-secondary)]">
              Enterprise Cloud Inventory
            </p>

          </div>

        </div>

      </div>

      <div
        className="
          mb-6
          bg-[var(--bg-card)]/50
          border
          border-[var(--border)]
          rounded-3xl
          p-5
          backdrop-blur-xl
        "
      >

        <div className="flex flex-col lg:flex-row gap-4 mb-6">

          <input
            type="text"
            placeholder="Buscar recursos, IPs, tags, IDs..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="
              flex-1
              px-5
              py-4
              rounded-2xl
              bg-[var(--bg-dark)]
              border
              border-[var(--border)]
              text-[var(--text-primary)]
              placeholder-[var(--text-secondary)]
              outline-none
            "
          />

          <button
            onClick={() =>
              exportCSV(
                filteredData,
                "inventory.csv"
              )
            }
            className="
              px-6
              py-4
              rounded-2xl
              bg-[var(--primary)]
              text-white
              hover:opacity-90
              transition-all
              font-semibold
            "
          >
            Export CSV
          </button>

        </div>

        <FilterSection
          title="Cuentas"
          values={accounts}
          selected={selectedAccounts}
          setSelected={setSelectedAccounts}
        />

        <FilterSection
          title="Cliente"
          values={clients}
          selected={selectedClients}
          setSelected={setSelectedClients}
        />

        <FilterSection
          title="Proyecto"
          values={projects}
          selected={selectedProjects}
          setSelected={setSelectedProjects}
        />



        <div className="mt-6">

          <button
            onClick={() =>
              setOnlyWithoutTags(
                !onlyWithoutTags
              )
            }
            className={`
              px-4
              py-2
              rounded-xl
              text-sm
              border
              transition-all

              ${
                onlyWithoutTags
                  ? "bg-red-500/20 text-red-400 border-red-500/20"
                  : "bg-[var(--bg-hover)] border-[var(--border)]"
              }
            `}
          >
            Sin Tags
          </button>

        </div>

      </div>

      <MetricsCards
        data={filteredData}
      />

      {mobileView ? (

        <InventoryCards
          data={filteredData}
          onSelect={setSelectedItem}
        />

      ) : (

        <InventoryTable
          data={filteredData}
          onSelect={setSelectedItem}
          onSort={handleSort}
          sortField={sortField}
          sortDirection={sortDirection}
        />

      )}

      <ResourceModal
        item={selectedItem}
        onClose={() =>
          setSelectedItem(null)
        }
      />

    </main>

  );

}

function FilterSection({
  title,
  values,
  selected,
  setSelected
}: any) {

  return (

    <div className="mb-5">

      <p
        className="
          text-xs
          uppercase
          tracking-wider
          text-[var(--text-secondary)]
          mb-3
        "
      >
        {title}
      </p>

      <div className="flex flex-wrap gap-2">

        {values.map((value: string) => {

          const active =
            selected.includes(value);

          return (

            <button
              key={value}
              onClick={() => {

                setSelected((prev: string[]) =>

                  active

                    ? prev.filter(
                        (v) => v !== value
                      )

                    : [...prev, value]

                );

              }}
              className={`
                px-3
                py-2
                rounded-xl
                text-sm
                border
                transition-all

                ${
                  active
                    ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                    : "bg-[var(--bg-hover)] border-[var(--border)]"
                }
              `}
            >
              {value}
            </button>

          );

        })}

      </div>

    </div>

  );

}

function LoadingCard({
  icon,
  text
}: {
  icon: React.ReactNode;
  text: string;
}) {

  return (

    <div
      className="
        px-5
        py-4
        rounded-2xl
        border
        border-[var(--border)]
        bg-[var(--bg-card)]/50
        backdrop-blur-xl
        flex
        items-center
        gap-3
      "
    >

      {icon}

      <span>{text}</span>

    </div>

  );

}