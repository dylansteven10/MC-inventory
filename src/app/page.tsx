"use client";

import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Cloud,
  Database,
  Shield,
  RotateCcw,
  Filter,
  ChevronDown,
  ChevronUp
} from "lucide-react";

import { InventoryItem } from "@/types/inventory";

import InventoryTable from "@/components/inventory/InventoryTable";
import InventoryCards from "@/components/inventory/InventoryCards";
import MetricsCards from "@/components/inventory/MetricsCards";
import ResourceModal from "@/components/inventory/ResourceModal";
import UserMenu from "@/components/layout/UserMenu";

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

  const [filtersOpen, setFiltersOpen] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [selectedProviders, setSelectedProviders] =
    useState<string[]>([]);

  const [selectedServices, setSelectedServices] =
    useState<string[]>([]);

  const [selectedClients, setSelectedClients] =
    useState<string[]>([]);

  const [selectedProjects, setSelectedProjects] =
    useState<string[]>([]);

  const [selectedAccounts, setSelectedAccounts] =
    useState<string[]>([]);

  const [selectedStatuses, setSelectedStatuses] =
    useState<string[]>([]);

  const [onlyWithoutTags, setOnlyWithoutTags] =
    useState(false);

  const [sortField, setSortField] =
    useState<SortField>("name");

  const [sortDirection, setSortDirection] =
    useState<"asc" | "desc">("asc");

  /* ───────────────────────────── */
  /* FETCH */
  /* ───────────────────────────── */

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

  /* ───────────────────────────── */
  /* RESPONSIVE */
  /* ───────────────────────────── */

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

  /* ───────────────────────────── */
  /* PROVIDER FILTERED DATA */
  /* ───────────────────────────── */

  const providerFilteredData =
    useMemo(() => {

      if (
        selectedProviders.length === 0
      ) {

        return data;

      }

      return data.filter((i) =>

        selectedProviders.includes(
          i.provider || ""
        )

      );

    }, [

      data,
      selectedProviders

    ]);

  /* ───────────────────────────── */
  /* FILTER OPTIONS */
  /* ───────────────────────────── */

  const providers = useMemo(() => {

    return [

      ...new Set(

        data.map(
          (i) => i.provider || "N/A"
        )

      )

    ].sort();

  }, [data]);

  const services = useMemo(() => {

    return [

      ...new Set(

        providerFilteredData.map(
          (i) => i.service
        )

      )

    ].sort();

  }, [providerFilteredData]);

  const accounts = useMemo(() => {

    return [

      ...new Set(

        providerFilteredData.map(
          (i) => i.accountName
        )

      )

    ].sort();

  }, [providerFilteredData]);

  const statuses = useMemo(() => {

    return [

      ...new Set(

        providerFilteredData.map(
          (i) => i.status
        )

      )

    ].sort();

  }, [providerFilteredData]);

  const clients = useMemo(() => {

    return [

      ...new Set(

        providerFilteredData
          .map(

            (i) =>

              i.tags?.cliente ||
              i.tags?.Cliente

          )
          .filter(Boolean)

      )

    ].sort();

  }, [providerFilteredData]);

  const projects = useMemo(() => {

    return [

      ...new Set(

        providerFilteredData
          .map(

            (i) =>

              i.tags?.proyecto ||
              i.tags?.Proyecto

          )
          .filter(Boolean)

      )

    ].sort();

  }, [providerFilteredData]);

  /* ───────────────────────────── */
  /* FILTERING */
  /* ───────────────────────────── */

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

        const providerMatch =

          selectedProviders.length === 0 ||

          selectedProviders.includes(
            item.provider || ""
          );

        const serviceMatch =

          selectedServices.length === 0 ||

          selectedServices.includes(
            item.service
          );

        const accountMatch =

          selectedAccounts.length === 0 ||

          selectedAccounts.includes(
            item.accountName
          );

        const statusMatch =

          selectedStatuses.length === 0 ||

          selectedStatuses.includes(
            item.status
          );

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

        const noTagsMatch =

          !onlyWithoutTags ||

          !item.tags ||

          Object.keys(item.tags).length === 0;

        return (

          searchMatch &&
          providerMatch &&
          serviceMatch &&
          accountMatch &&
          statusMatch &&
          clientMatch &&
          projectMatch &&
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
    selectedProviders,
    selectedServices,
    selectedClients,
    selectedProjects,
    selectedAccounts,
    selectedStatuses,
    onlyWithoutTags,
    sortField,
    sortDirection

  ]);

  /* ───────────────────────────── */
  /* SORT */
  /* ───────────────────────────── */

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

  /* ───────────────────────────── */
  /* CLEAR */
  /* ───────────────────────────── */

  const clearFilters = () => {

    setSearch("");

    setSelectedProviders([]);

    setSelectedServices([]);

    setSelectedClients([]);

    setSelectedProjects([]);

    setSelectedAccounts([]);

    setSelectedStatuses([]);

    setOnlyWithoutTags(false);

  };

  /* ───────────────────────────── */
  /* LOADING */
  /* ───────────────────────────── */

  if (loading) {

    return (

      <div
        className="
          min-h-screen
          flex
          items-center
          justify-center
        "
      >

        <div className="text-center">

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
            "
            style={{
              background:
                "linear-gradient(135deg, var(--gradient-start), var(--gradient-end))"
            }}
          >
            MC
          </div>

          <h1 className="text-5xl font-bold mb-4">
            MC Inventory
          </h1>

          <p className="text-[var(--text-secondary)] text-lg">
            Cargando inventario cloud...
          </p>

        </div>

      </div>

    );

  }

  return (

    <main
      className="min-h-screen px-4 py-6"
      style={{
        background:
          "linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-card) 100%)"
      }}
    >

      {/* HEADER */}

      <div className="mb-8">

        <div className="flex items-center justify-between gap-4">

          <div className="flex items-center gap-4">

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

              <h1 className="text-4xl font-bold">
                MC Inventory
              </h1>

              <p className="text-[var(--text-secondary)]">
                Enterprise Cloud Inventory
              </p>

            </div>

          </div>

          <UserMenu />

        </div>

      </div>

      {/* RESULTS */}

      <div
        className="
          flex
          items-center
          justify-between
          mb-5
        "
      >

        <div>

          <p className="text-lg font-semibold">
            Mostrando {filteredData.length} resources
          </p>

          <p className="text-sm text-[var(--text-secondary)]">
            Total Recursos: {data.length}
          </p>

        </div>

      </div>

      {/* METRICS */}

      <MetricsCards
        data={filteredData}
      />

      {/* FILTER CONTAINER */}

      <div
        className="
          mb-6
          bg-[var(--bg-card)]/60
          border
          border-[var(--border)]
          rounded-3xl
          p-6
          backdrop-blur-xl
        "
      >

        {/* TOOLBAR */}

        <div className="flex flex-col xl:flex-row gap-4 mb-6">

          <input
            type="text"
            placeholder="Buscar recursos, IDs, IPs, tags..."
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
              outline-none
            "
          />

          <div className="flex gap-3 flex-wrap">

            <button
              onClick={() =>
                setFiltersOpen(
                  !filtersOpen
                )
              }
              className="
                px-5
                py-4
                rounded-2xl
                border
                border-[var(--border)]
                bg-[var(--bg-hover)]
                flex
                items-center
                gap-2
              "
            >

              <Filter size={16} />

              Filtros

              {filtersOpen

                ? <ChevronUp size={16} />

                : <ChevronDown size={16} />

              }

            </button>

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
                font-semibold
              "
            >
              Export CSV
            </button>

            <button
              onClick={clearFilters}
              className="
                px-5
                py-4
                rounded-2xl
                border
                border-[var(--border)]
                bg-[var(--bg-hover)]
                flex
                items-center
                gap-2
              "
            >

              <RotateCcw size={16} />

              Clear

            </button>

          </div>

        </div>

        {/* FILTERS */}

        {filtersOpen && (

          <div className="space-y-6">

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

              <FilterBlock
                title="Infraestructura"
                icon={<Cloud size={16} />}
              >

                <FilterSection
                  title="Ubicación"
                  values={providers}
                  selected={selectedProviders}
                  setSelected={setSelectedProviders}
                />

                <FilterSection
                  title="Servicios"
                  values={services}
                  selected={selectedServices}
                  setSelected={setSelectedServices}
                />

                <FilterSection
                  title="Cuentas"
                  values={accounts}
                  selected={selectedAccounts}
                  setSelected={setSelectedAccounts}
                />

              </FilterBlock>

              <FilterBlock
                title="Operación"
                icon={<Database size={16} />}
              >

                <FilterSection
                  title="Estado"
                  values={statuses}
                  selected={selectedStatuses}
                  setSelected={setSelectedStatuses}
                  coloredStatus
                />

              </FilterBlock>

            </div>

            <FilterBlock
              title="Etiquetas"
              icon={<Shield size={16} />}
            >

              <div className="space-y-6">

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

                <div>

                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wider
                      text-[var(--text-secondary)]
                      mb-3
                    "
                  >
                    Compliance
                  </p>

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

                      ${
                        onlyWithoutTags
                          ? "bg-red-500/20 text-red-400 border-red-500/20"
                          : "bg-[var(--bg-hover)] border-[var(--border)]"
                      }
                    `}
                  >
                    Recursos sin tags
                  </button>

                </div>

              </div>

            </FilterBlock>

          </div>

        )}

      </div>

      {/* INVENTORY */}

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

      {/* MODAL */}

      <ResourceModal
        item={selectedItem}
        allItems={data}
        onNavigate={setSelectedItem}
        onClose={() =>
          setSelectedItem(null)
        }
      />

    </main>

  );

}

/* ───────────────────────────── */
/* FILTER BLOCK */
/* ───────────────────────────── */

function FilterBlock({
  title,
  icon,
  children
}: any) {

  const [open, setOpen] =
    useState(true);

  return (

    <div
      className="
        rounded-3xl
        border
        border-[var(--border)]
        bg-black/10
        overflow-hidden
      "
    >

      <button
        onClick={() =>
          setOpen(!open)
        }
        className="
          w-full
          p-5
          flex
          items-center
          justify-between
          hover:bg-[var(--bg-hover)]/30
          transition-all
        "
      >

        <div className="flex items-center gap-3">

          <div
            className="
              w-10
              h-10
              rounded-xl
              bg-[var(--primary)]/10
              text-[var(--primary)]
              flex
              items-center
              justify-center
            "
          >

            {icon}

          </div>

          <div className="text-left">

            <p className="font-semibold">
              {title}
            </p>

            <p
              className="
                text-xs
                text-[var(--text-secondary)]
                mt-1
              "
            >
              Click para expandir u ocultar
            </p>

          </div>

        </div>

        {open

          ? <ChevronUp size={18} />

          : <ChevronDown size={18} />

        }

      </button>

      {open && (

        <div
          className="
            px-5
            pb-5
            space-y-5
          "
        >

          {children}

        </div>

      )}

    </div>

  );

}

/* ───────────────────────────── */
/* FILTER SECTION */
/* ───────────────────────────── */

function FilterSection({
  title,
  values,
  selected,
  setSelected,
  coloredStatus
}: any) {

  return (

    <div>

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

                    ? "bg-[var(--primary)] border-[var(--primary)] text-white"

                    : coloredStatus

                      ? getStatusFilterStyle(value)

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

function getStatusFilterStyle(
  status: string
) {

  const s =
    status.toLowerCase();

  if (
    [
      "running",
      "available",
      "active",
      "ok"
    ].includes(s)
  ) {

    return `
      bg-green-500/10
      border-green-500/20
      text-green-400
    `;

  }

  if (
    [
      "stopped",
      "terminated"
    ].includes(s)
  ) {

    return `
      bg-red-500/10
      border-red-500/20
      text-red-400
    `;

  }

  return `
    bg-[var(--bg-hover)]
    border-[var(--border)]
  `;

}