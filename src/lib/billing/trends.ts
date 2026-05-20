import {
  BillingItem
} from "@/types/billing";

export function buildMonthlyTrend(
  items: BillingItem[]
) {

  const grouped:
    Record<string, number> = {};

  items.forEach((item) => {

    grouped[item.month] =

      (grouped[item.month] || 0)

      + item.cost;

  });

  return Object.entries(grouped)

    .map(([month, cost]) => ({

      month,

      cost:
        Number(cost.toFixed(2))

    }))

    .sort((a, b) =>

      a.month.localeCompare(
        b.month
      )

    );

}

export function calculateGrowth(
  items: BillingItem[]
) {

  const trends =
    buildMonthlyTrend(items);

  if (
    trends.length < 2
  ) {

    return 0;

  }

  const current =
    trends[trends.length - 1]
      .cost;

  const previous =
    trends[trends.length - 2]
      .cost;

  if (previous === 0) {

    return 0;

  }

  return Number(

    (
      (
        current - previous
      ) / previous
    * 100
    ).toFixed(2)

  );

}

export function calculateBurnRate(
  items: BillingItem[]
) {

  const total =
    items.reduce(

      (acc, item) =>

        acc + item.cost,

      0

    );

  return Number(

    (total / 30).toFixed(2)

  );

}