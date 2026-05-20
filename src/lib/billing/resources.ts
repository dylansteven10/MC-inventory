import {
  BillingItem
} from "@/types/billing";

export function getTopResources(
  items: BillingItem[],
  limit = 20
) {

  const map:
    Record<
      string,
      BillingItem
    > = {};

  items.forEach((item) => {

    if (!item.resourceId) {

      return;

    }

    const key =
      `${item.service}-${item.resourceId}`;

    if (!map[key]) {

      map[key] = {

        ...item,

        cost: 0

      };

    }

    map[key].cost +=
      item.cost;

  });

  return Object.values(map)

    .sort(
      (a, b) =>
        b.cost - a.cost
    )

    .slice(0, limit);

}