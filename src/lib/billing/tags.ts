import {
  BillingItem
} from "@/types/billing";

export function normalizeTagValue(
  value?: string
) {

  if (!value) {

    return "Sin tag";

  }

  const clean =
    value.trim();

  if (!clean) {

    return "Sin tag";

  }

  return clean;

}

export function normalizeTags(
  tags:
    Record<string, string>
) {

  const normalized:
    Record<string, string> = {};

  Object.entries(tags)
    .forEach(([key, value]) => {

      normalized[key] =
        normalizeTagValue(value);

    });

  return normalized;

}

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