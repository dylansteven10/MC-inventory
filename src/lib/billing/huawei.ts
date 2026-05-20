import axios from "axios";

import {
  BillingItem
} from "@/types/billing";

import {
  getHuaweiAccounts
} from "@/lib/huawei/accounts";

const core = require(
  "@huaweicloud/huaweicloud-sdk-core"
);

export async function getHuaweiBilling():
Promise<BillingItem[]> {

  try {

    const accounts =
      getHuaweiAccounts();

    const results =
      await Promise.all(

        accounts.map(async (account) => {

          try {

            const now =
              new Date();

            const year =
              now.getFullYear();

            const month =
              String(
                now.getMonth()
              ).padStart(2, "0");

            const uri =
              `/v2/bills/customer-bills/res-fee-records?bill_cycle=${year}-${month}`;

            const endpoint =
              `https://bss-intl.myhuaweicloud.com${uri}`;

            /* ───────────────────────────── */
            /* SDK */
            /* ───────────────────────────── */

            const signer =
              new core.Signer();

            signer.Key =
              account.ak;

            signer.Secret =
              account.sk;

            const request = {

              method: "GET",

              url: endpoint,

              headers: {

                "Content-Type":
                  "application/json;charset=UTF-8"

              }

            };

            signer.Sign(request);

            /* ───────────────────────────── */
            /* REQUEST */
            /* ───────────────────────────── */

            const response =
              await axios({

                method: "GET",

                url: endpoint,

                headers:
                  request.headers,

                validateStatus:
                  () => true

              });

            if (
              response.status >= 400
            ) {

              console.error(

                "HUAWEI BSS SDK ERROR:",

                JSON.stringify(
                  response.data,
                  null,
                  2
                )

              );

              return [];

            }

            const records =
              response.data
                ?.fee_records || [];

            return records.map((record: any) => ({

              provider:
                "HUAWEI CLOUD",

              accountName:
                account.name,

              accountId:
                account.projectId,

              service:
                record.service_type_name || "Unknown",

              region:
                record.region_name || "global",

              resourceId:
                record.resource_id,

              resourceName:
                record.resource_name,

              usageType:
                record.usage_type,

              usageQuantity:
                Number(
                  record.usage || 0
                ),

              cost:
                Number(
                  record.official_amount || 0
                ),

              currency:
                "USD",

              month:
                `${year}-${month}`,

              tags: {

                Cliente:
                  "Sin tag",

                Proyecto:
                  "Sin tag",

                Environment:
                  "Sin tag"

              }

            }));

          } catch (err) {

            console.error(
              "HUAWEI BILLING ACCOUNT ERROR:",
              err
            );

            return [];

          }

        })

      );

    return results.flat();

  } catch (error) {

    console.error(
      "HUAWEI BILLING ERROR:",
      error
    );

    return [];

  }

}