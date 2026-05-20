import {
  BillingItem
} from "@/types/billing";

export function normalizeBillingItems(
  items: BillingItem[]
) {

  return items.map((item) => ({

    ...item,

    cost:
      Number(item.cost || 0),

    currency:
      item.currency || "USD",

    tags:
      item.tags || {}

  }));

}