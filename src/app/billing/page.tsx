"use client";

import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  BillingItem
} from "@/types/billing";

import BillingCards from "@/components/billing/BillingCards";
import BillingCharts from "@/components/billing/BillingCharts";
import BillingTable from "@/components/billing/BillingTable";
import BillingTagFilters from "@/components/billing/BillingTagFilters";

export default function BillingPage() {

  const [billing, setBilling] =
    useState<BillingItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [selectedTag, setSelectedTag] =
    useState<string | null>(null);

  useEffect(() => {

    async function loadBilling() {

      try {

        const response =
          await fetch("/api/billing");

        const json =
          await response.json();

        setBilling(
          json.data || []
        );

      } catch (error) {

        console.error(
          "Billing fetch error:",
          error
        );

      } finally {

        setLoading(false);

      }

    }

    loadBilling();

  }, []);

  const filteredBilling =
    useMemo(() => {

      if (!selectedTag) {

        return billing;

      }

      return billing.filter((item) => {

        const tags =
          item.tags || {};

        return Object.values(tags)
          .includes(selectedTag);

      });

    }, [billing, selectedTag]);

  return (

    <div className="space-y-6">

      <div>

        <h1 className="text-3xl font-bold">
          Billing
        </h1>

        <p className="text-gray-400 mt-1">
          Costos multi-cloud por servicio, cuenta y tags.
        </p>

      </div>

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

      <BillingTable
        billing={filteredBilling}
        loading={loading}
      />

    </div>

  );

}