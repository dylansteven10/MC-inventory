import {
  BillingItem,
  BillingGroupedData,
  BillingSummary
} from "@/types/billing";

/* ───────────────────────────── */
/* TOTAL */
/* ───────────────────────────── */

export function calculateTotalCost(
  items: BillingItem[]
) {

  return items.reduce(

    (acc, item) =>

      acc + item.cost,

    0

  );

}

/* ───────────────────────────── */
/* GROUP */
/* ───────────────────────────── */

export function aggregateByField(

  items: BillingItem[],
  field: keyof BillingItem

): BillingGroupedData[] {

  const result:
    Record<string, number> = {};

  items.forEach((item) => {

    const key =
      String(
        item[field] || "Unknown"
      );

    result[key] =

      (result[key] || 0)

      + item.cost;

  });

  return Object.entries(result)

    .map(([name, value]) => ({

      name,

      value:
        Number(
          value.toFixed(2)
        )

    }))

    .sort((a, b) =>

      b.value - a.value

    );

}

/* ───────────────────────────── */
/* TAG */
/* ───────────────────────────── */

export function aggregateByTag(

  items: BillingItem[],
  tagKey: string

): BillingGroupedData[] {

  const result:
    Record<string, number> = {};

  items.forEach((item) => {

    const value =

      item.tags?.[tagKey] ||

      "Sin tag";

    result[value] =

      (result[value] || 0)

      + item.cost;

  });

  return Object.entries(result)

    .map(([name, value]) => ({

      name,

      value:
        Number(
          value.toFixed(2)
        )

    }))

    .sort((a, b) =>

      b.value - a.value

    );

}

/* ───────────────────────────── */
/* SUMMARY */
/* ───────────────────────────── */

export function buildBillingSummary(
  items: BillingItem[]
): BillingSummary {

  const totalCost =
    calculateTotalCost(items);

  const awsCost =
    calculateTotalCost(

      items.filter(

        (i) =>

          i.provider === "AWS"

      )

    );

  const huaweiCost =
    calculateTotalCost(

      items.filter(

        (i) =>

          i.provider === "HUAWEI CLOUD"

      )

    );

  const topService =

    aggregateByField(
      items,
      "service"
    )[0]?.name || "N/A";

  const topAccount =

    aggregateByField(
      items,
      "accountName"
    )[0]?.name || "N/A";

  const topProject =

    aggregateByTag(
      items,
      "Proyecto"
    )[0]?.name || "N/A";

  return {

    totalCost:
      Number(
        totalCost.toFixed(2)
      ),

    awsCost:
      Number(
        awsCost.toFixed(2)
      ),

    huaweiCost:
      Number(
        huaweiCost.toFixed(2)
      ),

    topService,

    topAccount,

    topProject

  };

}