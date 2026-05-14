import {
  ArrowUp,
  ArrowDown
} from "lucide-react";

import { InventoryItem } from "@/types/inventory";

import StatusBadge from "./StatusBadge";
import ServiceBadge from "./ServiceBadge";
import TagsList from "./TagsList";

type Props = {

  data: InventoryItem[];

  onSelect: (
    item: InventoryItem
  ) => void;

  onSort: (
    field: any
  ) => void;

  sortField: string;

  sortDirection: string;

};

export default function InventoryTable({

  data,
  onSelect,
  onSort,
  sortField,
  sortDirection

}: Props) {

  return (

    <div
      className="
        bg-[var(--bg-card)]/50
        rounded-3xl
        border
        border-[var(--border)]
        overflow-hidden
        backdrop-blur-xl
        animate-fadeSlide
      "
    >

      <div className="overflow-x-auto">

        <table className="w-full">

          <thead
            className="
              bg-[var(--bg-hover)]/70
              border-b
              border-[var(--border)]
            "
          >

            <tr>

              <Header
                title="Provider"
                field="provider"
                onSort={onSort}
                sortField={sortField}
                sortDirection={sortDirection}
              />

              <Header
                title="Cuenta"
                field="account"
                onSort={onSort}
                sortField={sortField}
                sortDirection={sortDirection}
              />

              <Header
                title="Servicio"
                field="service"
                onSort={onSort}
                sortField={sortField}
                sortDirection={sortDirection}
              />

              <Header
                title="Nombre"
                field="name"
                onSort={onSort}
                sortField={sortField}
                sortDirection={sortDirection}
              />

              <Header
                title="Network"
                field="host"
                onSort={onSort}
                sortField={sortField}
                sortDirection={sortDirection}
              />

              <Header
                title="Estado"
                field="status"
                onSort={onSort}
                sortField={sortField}
                sortDirection={sortDirection}
              />

              <th className="px-5 py-4 text-left text-xs">
                SGs
              </th>

              <th className="px-5 py-4 text-left text-xs">
                Tags
              </th>

            </tr>

          </thead>

          <tbody>

            {data.map((item) => (

              <tr
                key={item.uniqueKey}
                onClick={() => onSelect(item)}
                className="
                  border-b
                  border-[var(--border)]
                  hover:bg-[var(--bg-hover)]/50
                  transition-all
                  cursor-pointer
                "
              >

                <td className="px-5 py-4 text-sm">
                  {item.provider}
                </td>

                <td className="px-5 py-4 text-sm">
                  {item.accountName}
                </td>

                <td className="px-5 py-4">
                  <ServiceBadge
                    service={item.service}
                  />
                </td>

                <td className="px-5 py-4">

                  <div>

                    <p className="font-semibold">
                      {item.name}
                    </p>

                    <p
                      className="
                        text-xs
                        text-[var(--text-secondary)]
                        font-mono
                      "
                    >
                      {item.id}
                    </p>

                  </div>

                </td>

                <td className="px-5 py-4">

                  <div
                    className="
                      text-xs
                      space-y-1
                    "
                  >

                    <p>
                      {item.host}
                    </p>

                    {item.privateIp && (

                      <p className="text-cyan-400">
                        PRI: {item.privateIp}
                      </p>

                    )}

                    {item.publicIp && (

                      <p className="text-orange-400">
                        PUB: {item.publicIp}
                      </p>

                    )}

                  </div>

                </td>

                <td className="px-5 py-4">
                  <StatusBadge
                    status={item.status}
                  />
                </td>

                <td className="px-5 py-4">

                  <div
                    className="
                      flex
                      flex-wrap
                      gap-2
                    "
                  >

                    {(item.securityGroups || [])
                      .slice(0, 2)
                      .map((sg) => (

                      <span
                        key={sg.id}
                        className="
                          px-2
                          py-1
                          rounded-lg
                          bg-yellow-500/10
                          text-yellow-400
                          text-xs
                          border
                          border-yellow-500/20
                        "
                      >
                        {sg.name}
                      </span>

                    ))}

                  </div>

                </td>

                <td className="px-5 py-4 min-w-[260px]">
                  <TagsList
                    tags={item.tags}
                  />
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}

function Header({

  title,
  field,
  onSort,
  sortField,
  sortDirection

}: any) {

  const active =
    sortField === field;

  return (

    <th
      onClick={() => onSort(field)}
      className="
        px-5
        py-4
        text-left
        text-xs
        uppercase
        tracking-wider
        text-[var(--text-secondary)]
        cursor-pointer
        select-none
      "
    >

      <div className="flex items-center gap-2">

        {title}

        {active ? (

          sortDirection === "asc"

            ? <ArrowUp size={14} />

            : <ArrowDown size={14} />

        ) : (

          <ArrowUp
            size={14}
            className="opacity-30"
          />

        )}

      </div>

    </th>

  );

}