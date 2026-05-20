import {
  NextRequest,
  NextResponse
} from "next/server";

import {
  getAWSBilling
} from "@/lib/billing/aws";

import {
  applyBillingFilters
} from "@/lib/billing/filters";

import {
  groupBillingData
} from "@/lib/billing/grouping";

import {
  normalizeBillingData
} from "@/lib/billing/normalize";

export async function GET(
  request: NextRequest
) {

  try {

    const {
      searchParams
    } = new URL(
      request.url
    );

    const filters = {

      start:
        searchParams.get(
          "start"
        ) || undefined,

      end:
        searchParams.get(
          "end"
        ) || undefined,

      provider:
        searchParams.get(
          "provider"
        ) || undefined,

      service:
        searchParams.get(
          "service"
        ) || undefined,

      account:
        searchParams.get(
          "account"
        ) || undefined,

      tagKey:
        searchParams.get(
          "tagKey"
        ) || undefined,

      tagValue:
        searchParams.get(
          "tagValue"
        ) || undefined,

      groupBy:
        searchParams.get(
          "groupBy"
        ) as any

    };

    /*
      AWS Billing
    */

    const awsBilling =
      await getAWSBilling();

    /*
      Normalize
    */

    const normalized =
      normalizeBillingData(
        awsBilling
      );

    /*
      Filters
    */

    const filtered =
      applyBillingFilters(
        normalized,
        filters
      );

    /*
      Grouping
    */

    let grouped = null;

    if (filters.groupBy) {

      grouped =
        groupBillingData(

          filtered,

          filters.groupBy

        );

    }

    /*
      Facets
    */

    const providers =
      Array.from(

        new Set(

          filtered.map(
            (i) => i.provider
          )

        )

      ).sort();

    const services =
      Array.from(

        new Set(

          filtered.map(
            (i) => i.service
          )

        )

      ).sort();

    const accounts =
      Array.from(

        new Set(

          filtered.map(
            (i) => i.accountName
          )

        )

      ).sort();

    /*
      Tag facets
    */

    const tagFacets:
      Record<string, string[]> = {};

    for (const item of filtered) {

      const tags =
        item.tags || {};

      for (const [

        key,
        value

      ] of Object.entries(tags)) {

        if (!tagFacets[key]) {

          tagFacets[key] = [];

        }

        if (
          value &&
          !tagFacets[key]
            .includes(value)
        ) {

          tagFacets[key]
            .push(value);

        }

      }

    }

    Object.keys(tagFacets)
      .forEach((key) => {

        tagFacets[key]
          .sort();

      });

    /*
      Total
    */

    const total =

      filtered.reduce(

        (acc, item) =>

          acc + item.cost,

        0

      );

    return NextResponse.json({

      success: true,

      filters,

      total,

      count:
        filtered.length,

      grouped,

      facets: {

        providers,
        services,
        accounts,
        tags:
          tagFacets

      },

      data:
        filtered

    });

  } catch (error) {

    console.error(
      "BILLING API ERROR:",
      error
    );

    return NextResponse.json(

      {
        success: false
      },

      {
        status: 500
      }

    );

  }

}