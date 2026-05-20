import {

  BillingFilters,
  BillingItem

} from "@/types/billing";

export function applyBillingFilters(

  items: BillingItem[],

  filters: BillingFilters

) {

  return items.filter((item) => {

    /* START */

    if (
      filters.start &&
      item.month < filters.start
    ) {

      return false;

    }

    /* END */

    if (
      filters.end &&
      item.month > filters.end
    ) {

      return false;

    }

    /* PROVIDER */

    if (
      filters.provider &&
      item.provider !==
      filters.provider
    ) {

      return false;

    }

    /* SERVICE */

    if (
      filters.service &&
      item.service !==
      filters.service
    ) {

      return false;

    }

    /* ACCOUNT */

    if (
      filters.account &&
      item.accountName !==
      filters.account
    ) {

      return false;

    }

    /* TAG */

    if (
      filters.tagKey &&
      filters.tagValue
    ) {

      const value =
        item.tags?.[
          filters.tagKey
        ];

      if (
        value !==
        filters.tagValue
      ) {

        return false;

      }

    }

    return true;

  });

}