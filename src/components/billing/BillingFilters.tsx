"use client";

import {
  BillingItem
} from "@/types/billing";

type Props = {

  billing: BillingItem[];

  search: string;
  setSearch: (
    value: string
  ) => void;

  provider: string;
  setProvider: (
    value: string
  ) => void;

  service: string;
  setService: (
    value: string
  ) => void;

  account: string;
  setAccount: (
    value: string
  ) => void;

};

export default function BillingFilters({

  billing,

  search,
  setSearch,

  provider,
  setProvider,

  service,
  setService,

  account,
  setAccount

}: Props) {

  const providers =
    Array.from(

      new Set(

        billing.map(
          (b) => b.provider
        )

      )

    );

  const services =
    Array.from(

      new Set(

        billing.map(
          (b) => b.service
        )

      )

    ).sort();

  const accounts =
    Array.from(

      new Set(

        billing.map(
          (b) => b.accountName
        )

      )

    ).sort();

  return (

    <div
      className="
        rounded-3xl
        border
        border-white/10
        bg-white/5
        p-5
        grid
        grid-cols-1
        md:grid-cols-2
        xl:grid-cols-4
        gap-4
      "
    >

      {/* SEARCH */}

      <input
        value={search}
        onChange={(e) =>
          setSearch(
            e.target.value
          )
        }
        placeholder="
          Buscar servicio,
          tag,
          cuenta...
        "
        className="
          px-4
          py-3
          rounded-2xl
          bg-black/30
          border
          border-white/10
          outline-none
        "
      />

      {/* PROVIDER */}

      <select
        value={provider}
        onChange={(e) =>
          setProvider(
            e.target.value
          )
        }
        className="
          px-4
          py-3
          rounded-2xl
          bg-black/30
          border
          border-white/10
          outline-none
        "
      >

        <option value="">
          Todos Providers
        </option>

        {providers.map((p) => (

          <option
            key={p}
            value={p}
          >
            {p}
          </option>

        ))}

      </select>

      {/* SERVICE */}

      <select
        value={service}
        onChange={(e) =>
          setService(
            e.target.value
          )
        }
        className="
          px-4
          py-3
          rounded-2xl
          bg-black/30
          border
          border-white/10
          outline-none
        "
      >

        <option value="">
          Todos Servicios
        </option>

        {services.map((s) => (

          <option
            key={s}
            value={s}
          >
            {s}
          </option>

        ))}

      </select>

      {/* ACCOUNT */}

      <select
        value={account}
        onChange={(e) =>
          setAccount(
            e.target.value
          )
        }
        className="
          px-4
          py-3
          rounded-2xl
          bg-black/30
          border
          border-white/10
          outline-none
        "
      >

        <option value="">
          Todas las cuentas
        </option>

        {accounts.map((a) => (

          <option
            key={a}
            value={a}
          >
            {a}
          </option>

        ))}

      </select>

    </div>

  );

}