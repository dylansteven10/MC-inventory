// src/components/inventory/TagsList.tsx

"use client";

import { formatTags } from "@/lib/inventory/formatTags";

export default function TagsList({
  tags
}: {
  tags?: Record<string, string>;
}) {

  const formatted =
    formatTags(tags);

  return (

    <div className="flex flex-wrap gap-2">

      {formatted.map((tag) => {

        const isNoTag =
          tag === "Sin tags";

        return (

          <span
            key={tag}
            className={`
              px-3
              py-1
              rounded-xl
              text-xs
              border
              backdrop-blur-sm
              transition-all

              ${
                isNoTag
                  ? `
                    bg-red-500/10
                    text-red-400
                    border-red-500/20
                  `
                  : `
                    bg-[var(--primary)]/10
                    text-[var(--primary)]
                    border-[var(--primary)]/20
                    hover:bg-[var(--primary)]/20
                  `
              }
            `}
          >
            {tag}
          </span>

        );

      })}

    </div>

  );

}