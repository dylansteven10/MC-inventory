import {
  BillingItem
} from "@/types/billing";

export default function BillingTable({
  billing,
  loading
}: {
  billing: BillingItem[];
  loading: boolean;
}) {

  if (loading) {

    return (

      <div className="text-gray-400">
        Loading billing...
      </div>

    );

  }

  return (

    <div
      className="
        rounded-3xl
        border
        border-white/10
        bg-white/5
        overflow-hidden
      "
    >

      <div className="p-5 border-b border-white/10">

        <h2 className="text-xl font-semibold">
          Billing detallado
        </h2>

      </div>

      <div className="overflow-auto">

        <table className="w-full text-sm">

          <thead className="bg-white/5">

            <tr>

              <th className="text-left p-4">
                Provider
              </th>

              <th className="text-left p-4">
                Servicio
              </th>

              <th className="text-left p-4">
                Tags
              </th>

              <th className="text-left p-4">
                Costo
              </th>

            </tr>

          </thead>

          <tbody>

            {billing.map((item, idx) => (

              <tr
                key={idx}
                className="
                  border-t
                  border-white/10
                "
              >

                <td className="p-4">
                  {item.provider}
                </td>

                <td className="p-4">
                  {item.service}
                </td>

                <td className="p-4">

                  <div className="flex flex-wrap gap-2">

                    {Object.entries(
                      item.tags || {}
                    ).map(([k, v]) => (

                      <span
                        key={k}
                        className="
                          px-2
                          py-1
                          rounded-lg
                          bg-cyan-500/20
                          text-cyan-300
                          text-xs
                        "
                      >

                        {k}: {v}

                      </span>

                    ))}

                  </div>

                </td>

                <td className="p-4 font-semibold">
                  ${item.cost.toFixed(2)}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}