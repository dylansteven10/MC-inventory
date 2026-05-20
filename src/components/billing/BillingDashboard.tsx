"use client";

import {
  useMemo,
  useState
} from "react";

import {
  BillingItem
} from "@/types/billing";

import BillingCards from "./BillingCards";
import BillingCharts from "./BillingCharts";
import BillingTable from "./BillingTable";
import BillingTagFilters from "./BillingTagFilters";
import BillingFilters from "./BillingFilters";
import BillingTrends from "./BillingTrends";
import BillingResources from "@/components/billing/BillingResources";

type Props = {

  billing: BillingItem[];

  loading: boolean;

};

export default function BillingDashboard({

  billing,
  loading

}: Props) {

  const [

    selectedTag,
    setSelectedTag

  ] = useState<string | null>(
    null
  );

  const [

    search,
    setSearch

  ] = useState("");

  const [

    provider,
    setProvider

  ] = useState("");

  const [

    service,
    setService

  ] = useState("");

  const [

    account,
    setAccount

  ] = useState("");

  const filteredBilling =
    useMemo(() => {

      return billing.filter(
        (item) => {

          /* TAG */

          if (
            selectedTag
          ) {

            const tags =
              item.tags || {};

            const hasTag =
              Object.values(
                tags
              ).includes(
                selectedTag
              );

            if (!hasTag) {

              return false;

            }

          }

          /* SEARCH */

          if (search) {

            const q =
              search.toLowerCase();

            const raw =
`
${item.provider}
${item.service}
${item.accountName}
${JSON.stringify(item.tags)}
`
            .toLowerCase();

            if (
              !raw.includes(q)
            ) {

              return false;

            }

          }

          /* PROVIDER */

          if (
            provider &&
            item.provider !== provider
          ) {

            return false;

          }

          /* SERVICE */

          if (
            service &&
            item.service !== service
          ) {

            return false;

          }

          /* ACCOUNT */

          if (
            account &&
            item.accountName !== account
          ) {

            return false;

          }

          return true;

        }
      );

    }, [

      billing,

      selectedTag,

      search,
      provider,
      service,
      account

    ]);

  return (

    <div className="space-y-6">

      <BillingFilters

        billing={billing}

        search={search}
        setSearch={setSearch}

        provider={provider}
        setProvider={setProvider}

        service={service}
        setService={setService}

        account={account}
        setAccount={setAccount}

      />

      <BillingTagFilters
        billing={billing}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
      />

      <BillingCards
        billing={filteredBilling}
      />

      <BillingCharts
        billing={filteredBilling}
      />
      <BillingResources
        billing={filteredBilling}
      />
      <BillingTrends
        billing={filteredBilling}
      />
      <BillingTable
        billing={filteredBilling}
        loading={loading}
      />

    </div>

  );

}