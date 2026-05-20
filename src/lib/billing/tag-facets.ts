import {
  BillingItem
} from "@/types/billing";

export function getBillingTagFacets(
  items: BillingItem[]
) {

  const facets:
    Record<
      string,
      Set<string>
    > = {};

  items.forEach((item) => {

    Object.entries(
      item.tags || {}
    ).forEach(([key, value]) => {

      if (!facets[key]) {

        facets[key] =
          new Set();

      }

      facets[key].add(
        value || "Sin tag"
      );

    });

  });

  return Object.entries(facets)
    .reduce((acc, [k, v]) => {

      acc[k] =
        Array.from(v).sort();

      return acc;

    }, {} as Record<string, string[]>);

}