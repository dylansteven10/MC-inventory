"use client";

import {
  BillingItem
} from "@/types/billing";

type Props = {

  billing: BillingItem[];

  selectedTag: string | null;

  onSelectTag: (
    tag: string | null
  ) => void;

};

export default function BillingTagFilters({
  billing,
  selectedTag,
  onSelectTag
}: Props) {

  const uniqueTags =
    Array.from(

      new Set(

        billing.flatMap((item) =>

          Object.values(
            item.tags || {}
          )

        )

      )

    )

    .filter(Boolean)

    .sort();

  return (

    <div
      className="
        rounded-3xl
        border
        border-white/10
        bg-white/5
        p-5
        flex
        flex-wrap
        gap-3
      "
    >

      <button
        onClick={() =>
          onSelectTag(null)
        }
        className={`
          px-4
          py-2
          rounded-2xl
          border
          transition-all

          ${
            selectedTag === null

              ? "bg-cyan-500 text-black border-cyan-500"

              : "border-white/10 bg-black/20"
          }
        `}
      >

        Todos

      </button>

      {uniqueTags.map((tag) => (

        <button
          key={tag}
          onClick={() =>
            onSelectTag(tag)
          }
          className={`
            px-4
            py-2
            rounded-2xl
            border
            transition-all

            ${
              selectedTag === tag

                ? "bg-cyan-500 text-black border-cyan-500"

                : "border-white/10 bg-black/20"
            }
          `}
        >

          {tag}

        </button>

      ))}

    </div>

  );

}