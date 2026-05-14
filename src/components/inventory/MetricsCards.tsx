// src/components/inventory/MetricsCards.tsx

import { InventoryItem } from "@/types/inventory";

type Props = {
  data: InventoryItem[];
};

export default function MetricsCards({
  data
}: Props) {

  const total =
    data.length;

  const running =
    data.filter((i) =>

      [
        "running",
        "available",
        "active",
        "ok"
      ].includes(
        i.status.toLowerCase()
      )

    ).length;

  const stopped =
    total - running;

  const noTags =
    data.filter(

      (i) =>
        !i.tags ||
        Object.keys(i.tags).length === 0

    ).length;

  const withSG =
    data.filter(

      (i) =>
        i.securityGroups &&
        i.securityGroups.length > 0

    ).length;

  const metrics = [

    {
      label: "Total",
      value: total,
      color: "var(--primary)"
    },

    {
      label: "Running",
      value: running,
      color: "var(--success)"
    },

    {
      label: "Stopped",
      value: stopped,
      color: "var(--error)"
    },

    {
      label: "Con SG",
      value: withSG,
      color: "var(--warning)"
    },

    {
      label: "Sin tags",
      value: noTags,
      color: "var(--info)"
    }

  ];

  return (

    <div
      className="
        grid
        grid-cols-2
        xl:grid-cols-5
        gap-4
        mb-8
      "
    >

      {metrics.map((metric) => (

        <div
          key={metric.label}
          className="
            relative
            overflow-hidden
            bg-[var(--bg-card)]/60
            backdrop-blur-xl
            border
            border-[var(--border)]
            rounded-3xl
            p-5
          "
        >

          <div
            className="
              absolute
              inset-0
              opacity-10
            "
            style={{
              background:
                `linear-gradient(135deg, ${metric.color}, transparent)`
            }}
          />

          <div className="relative z-10">

            <p
              className="
                text-xs
                uppercase
                tracking-wider
                text-[var(--text-secondary)]
                mb-2
              "
            >
              {metric.label}
            </p>

            <p
              className="
                text-4xl
                font-bold
              "
              style={{
                color: metric.color
              }}
            >
              {metric.value}
            </p>

          </div>

        </div>

      ))}

    </div>

  );

}