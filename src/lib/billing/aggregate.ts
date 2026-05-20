import {
  BillingItem
} from "@/types/billing";

export function calculateTotalCost(
  items: BillingItem[]
) {

  return items.reduce(

    (acc, item) =>

      acc + item.cost,

    0

  );

}

export function aggregateByField(
  items: BillingItem[],
  field: keyof BillingItem
) {

  const result:
    Record<string, number> = {};

  items.forEach((item) => {

    const key =
      String(item[field] || "Unknown");

    result[key] =
      (result[key] || 0) +
      item.cost;

  });

  return result;

}