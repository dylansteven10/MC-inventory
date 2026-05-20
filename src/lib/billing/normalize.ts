import {
  BillingItem,
  BillingTagMap
} from "@/types/billing";

const GOVERNANCE_TAGS = [

  "Cliente",
  "Proyecto",
  "Environment",
  "Owner",
  "CostCenter"

];

function normalizeTags(
  tags?: BillingTagMap
): BillingTagMap {

  const normalized:
    BillingTagMap = {};

  for (const tagKey of GOVERNANCE_TAGS) {

    const value =
      tags?.[tagKey];

    normalized[tagKey] =

      value &&
      value.trim() !== ""

        ? value

        : "Sin tag";

  }

  return normalized;

}

export function normalizeBillingData(
  items: BillingItem[]
): BillingItem[] {

  const map:
    Record<string, BillingItem> = {};

  for (const item of items) {

    /*
      Eliminamos metadata interna
    */

    if (
      item.service ===
      "__tag_metadata__"
    ) {

      continue;

    }

    /*
      Key enterprise
    */

    const key = [

      item.provider,
      item.accountId,
      item.service,
      item.month,
      item.resourceId || "global"

    ].join("|");

    const normalizedTags =
      normalizeTags(
        item.tags
      );

    /*
      Nuevo item
    */

    if (!map[key]) {

      map[key] = {

        ...item,

        cost:
          Number(
            item.cost || 0
          ),

        tags:
          normalizedTags

      };

      continue;

    }

    /*
      Merge tags
    */

    map[key].tags = {

      ...(map[key].tags || {}),
      ...normalizedTags

    };

    /*
      Merge cost
      SOLO si vienen
      recursos separados
    */

    map[key].cost +=
      Number(item.cost || 0);

  }

  return Object.values(map)

    /*
      limpieza extra
    */

    .filter(

      (item) =>

        item.service &&
        item.cost >= 0

    )

    /*
      orden enterprise
    */

    .sort((a, b) => {

      if (a.month !== b.month) {

        return a.month.localeCompare(
          b.month
        );

      }

      return (
        b.cost - a.cost
      );

    });

}