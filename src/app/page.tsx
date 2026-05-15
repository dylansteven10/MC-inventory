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
import ScrollToTop from "@/components/ui/ScrollToTop";

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
    useState(false);

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

  const [refreshing, setRefreshing] =
    useState(false);

  const [lastUpdate, setLastUpdate] =
    useState<string>("");

  useEffect(() => {

    let mounted = true;

    const load = async (
      initial = false
    ) => {

      try {

        if (initial) {

          setLoading(true);

        } else {

          setRefreshing(true);

        }

        const response =
          await fetch(
            "/api/inventory",
            {
              cache: "no-store"
            }
          );

        const json =
          await response.json();

        if (!mounted) return;

        setData(json.data);

        setLastUpdate(

          new Date(
            json.timestamp
          ).toLocaleTimeString()

        );

        console.log(
          "Inventory source:",
          json.source
        );

        console.log(
          "Refreshing:",
          json.refreshing
        );

      } catch (error) {

        console.error(
          "Inventory fetch error:",
          error
        );

      } finally {

        if (!mounted) return;

        setLoading(false);

        setRefreshing(false);

      }

    };

    /* FIRST LOAD */

    load(true);

    /* AUTO REFRESH */

    const interval = setInterval(() => {

      load(false);

    }, 30000);

    return () => {

      mounted = false;

      clearInterval(interval);

    };

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
              rounded-xl
              mx-auto
              mb-8
              animate-glowPulse
              flex
              items-center
              justify-center
              text-white
              text-3xl
              font-bold
            "
            style={{
              background:
                "linear-gradient(135deg, var(--gradient-start), var(--gradient-end))"
            }}
          >
            MC
          </div>

          <h1 className="text-4xl font-bold mb-4">
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
                w-12
                h-12
                rounded-xl
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

              <h1 className="text-3xl font-bold">
                MC Inventory
              </h1>

              <p className="text-[var(--text-secondary)]">
                Inventario Cloud Centralizado
              </p>

            </div>

          </div>

          <div className="flex items-center gap-4">

            <div className="text-right">

              <p
                className="
                  text-xs
                  text-[var(--text-secondary)]
                "
              >
                Última actualización
              </p>

              <div className="flex items-center gap-2 justify-end">

                <p className="text-sm font-medium">
                  {lastUpdate || "--"}
                </p>

                {refreshing && (

                  <div
                    className="
                      px-2
                      py-1
                      rounded-full
                      text-[10px]
                      bg-[var(--primary)]/10
                      border
                      border-[var(--primary)]/20
                      text-[var(--primary)]
                      animate-pulse
                    "
                  >
                    Actualizando...
                  </div>

                )}

              </div>

            </div>

            <UserMenu />

          </div>

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
          rounded-xl
          p-4
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
              py-3
              interactive-button
              interactive-glow
              rounded-xl
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
                py-3
                interactive-button
                interactive-glow
                rounded-xl
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
                px-5
                py-3
                interactive-button
                interactive-glow
                rounded-xl
                border
                border-[var(--border)]
                bg-[var(--bg-hover)]
                flex
                items-center
                gap-2
              "
            >
              Export CSV
            </button>

            <button
              onClick={clearFilters}
              className="
                px-5
                py-3
                interactive-button
                interactive-glow
                rounded-xl
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

                <DropdownFilterSection
                  title="Servicios"
                  values={services}
                  selected={selectedServices}
                  setSelected={setSelectedServices}
                />

                <DropdownFilterSection
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

                <DropdownFilterSection
                  title="Cliente"
                  values={clients}
                  selected={selectedClients}
                  setSelected={setSelectedClients}
                />

                <DropdownFilterSection
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

      <ScrollToTop />

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
    useState(false);

  return (

    <div
      className="
        rounded-xl
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
            interactive-button
            interactive-glow
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
                px-2.5
                py-1.5
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

function DropdownFilterSection({
  title,
  values,
  selected,
  setSelected
}: any) {

  const [open, setOpen] =
    useState(false);

  return (

    <div>

      <button
        onClick={() =>
          setOpen(!open)
        }
        className="
          w-full
          flex
          items-center
          justify-between
          px-4
          py-3
          rounded-xl
          border
          border-[var(--border)]
          bg-[var(--bg-hover)]
          mb-3
        "
      >

        <div className="text-left">

          <p
            className="
              text-xs
              uppercase
              tracking-wider
              text-[var(--text-secondary)]
            "
          >
            {title}
          </p>

          <p className="text-sm mt-1">

            {

              selected.length === 0

                ? "Todos"

                : `${selected.length} seleccionados`

            }

          </p>

        </div>

        {

          open

            ? <ChevronUp size={16} />

            : <ChevronDown size={16} />

        }

      </button>

      {open && (

        <div
          className="
            max-h-72
            overflow-y-auto
            rounded-xl
            border
            border-[var(--border)]
            bg-[var(--bg-dark)]
            p-3
            space-y-2
            animate-fadeSlide
          "
        >

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
                  w-full
                  text-left
                  px-4
                  py-3
                  rounded-xl
                  border
                  text-sm
                  transition-all

                  ${
                    active

                      ? "bg-[var(--primary)] text-white border-[var(--primary)]"

                      : "bg-[var(--bg-hover)] border-[var(--border)] hover:border-[var(--primary)]/30"
                  }
                `}
              >

                {value}

              </button>

            );

          })}

        </div>

      )}

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