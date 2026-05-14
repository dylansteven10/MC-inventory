"use client";

import { getStatusStyle } from "@/lib/inventory/getStatusStyle";

export default function StatusBadge({
  status
}: {
  status: string;
}) {

  return (

    <span
      className={`
        inline-block
        px-2
        py-1
        rounded-lg
        text-xs
        ${getStatusStyle(status)}
      `}
    >
      {status}
    </span>

  );

}