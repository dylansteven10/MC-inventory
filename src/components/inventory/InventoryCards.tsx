import { InventoryItem } from "@/types/inventory";

import ServiceBadge from "./ServiceBadge";
import StatusBadge from "./StatusBadge";
import TagsList from "./TagsList";

type Props = {

  data: InventoryItem[];

  onSelect: (
    item: InventoryItem
  ) => void;

};

export default function InventoryCards({

  data,
  onSelect

}: Props) {

  return (

    <div className="space-y-4">

      {data.map((item) => (

        <div
          key={item.uniqueKey}
          onClick={() => onSelect(item)}
          className="
            bg-[var(--bg-card)]/60
            border
            border-[var(--border)]
            rounded-3xl
            p-5
            backdrop-blur-xl
            cursor-pointer
          "
        >

          <div className="flex justify-between gap-4 mb-4">

            <div>

              <h3 className="font-bold text-lg">
                {item.name}
              </h3>

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

            <ServiceBadge
              service={item.service}
            />

          </div>

          <div className="flex items-center gap-3 mb-4">

            <StatusBadge
              status={item.status}
            />

            <span
              className="
                text-xs
                text-[var(--text-secondary)]
              "
            >
              {item.provider}
            </span>

          </div>

          <div className="mb-4">

            <p className="text-xs text-gray-400 mb-1">
              Network
            </p>

            <p className="text-sm">
              {item.host}
            </p>

          </div>

          {(item.securityGroups || []).length > 0 && (

            <div className="mb-4">

              <p className="text-xs text-gray-400 mb-2">
                Security Groups
              </p>

              <div className="flex flex-wrap gap-2">

                {item.securityGroups
                  ?.slice(0, 2)
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
                    "
                  >
                    {sg.name}
                  </span>

                ))}

              </div>

            </div>

          )}

          <TagsList
            tags={item.tags}
          />

        </div>

      ))}

    </div>

  );

}