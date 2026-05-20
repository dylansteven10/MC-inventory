import {
  BillingItem
} from "@/types/billing";

export function extractUniqueTagValues(
  items: BillingItem[],
  tagKey: string
) {

  const values =
    new Set<string>();

  items.forEach((item) => {

    const value =
      item.tags?.[tagKey];

    if (value) {

      values.add(value);

    }

  });

  return Array.from(values)
    .sort();

}