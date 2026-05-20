import {
  BillingItem
} from "@/types/billing";

export function groupBillingData(

  items: BillingItem[],

  groupBy:
    | "SERVICE"
    | "ACCOUNT"
    | "PROVIDER"
    | "TAG"

) {

  const grouped:
    Record<string, number> = {};

  items.forEach((item) => {

    let key = "Unknown";

    switch (groupBy) {

      case "SERVICE":

        key =
          item.service;

        break;

      case "ACCOUNT":

        key =
          item.accountName;

        break;

      case "PROVIDER":

        key =
          item.provider;

        break;

      case "TAG":

        key =

          Object.values(
            item.tags || {}
          )[0]

          || "Sin tag";

        break;

    }

    grouped[key] =

      (grouped[key] || 0)

      + item.cost;

  });

  return Object.entries(grouped)

    .map(([name, cost]) => ({

      name,

      cost:
        Number(cost.toFixed(2))

    }))

    .sort((a, b) =>

      b.cost - a.cost

    );

}