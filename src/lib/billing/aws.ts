import {

  CostExplorerClient,

  GetCostAndUsageCommand

} from "@aws-sdk/client-cost-explorer";

import {
  BillingItem
} from "@/types/billing";

import {
  getAWSAccounts
} from "@/lib/aws/accounts";

const BILLING_TAGS = [

  "Cliente",
  "Proyecto",
  "Environment"

];

export async function getAWSBilling(): Promise<BillingItem[]> {

  try {

    const accounts =
      getAWSAccounts();

    const results =
      await Promise.all(

        accounts.map(async (account) => {

          const client =
            new CostExplorerClient({

              region: "us-east-1",

              credentials: {

                accessKeyId:
                  account.accessKeyId,

                secretAccessKey:
                  account.secretAccessKey

              }

            });

          const now =
            new Date();

          const start =
            new Date(
              now.getFullYear(),
              now.getMonth() - 1,
              1
            );

          const end =
            new Date(
              now.getFullYear(),
              now.getMonth(),
              1
            );

          const billingItems:
            BillingItem[] = [];

          for (const tagKey of BILLING_TAGS) {

            const command =
              new GetCostAndUsageCommand({

                TimePeriod: {

                  Start:
                    start.toISOString().split("T")[0],

                  End:
                    end.toISOString().split("T")[0]

                },

                Granularity:
                  "MONTHLY",

                Metrics: [
                  "UnblendedCost"
                ],

                GroupBy: [

                  {
                    Type: "DIMENSION",
                    Key: "SERVICE"
                  },

                  {
                    Type: "TAG",
                    Key: tagKey
                  }

                ]

              });

            const response =
              await client.send(command);

            const groups =

              response.ResultsByTime?.[0]
                ?.Groups || [];

            groups.forEach((group) => {

              const service =
                group.Keys?.[0] || "Unknown";

              const rawTag =
                group.Keys?.[1] || "";

              const tagValue =

                rawTag.includes("$")

                  ? rawTag.split("$")[1]

                  : "Sin tag";

              const cost =
                Number(

                  group.Metrics
                    ?.UnblendedCost
                    ?.Amount || 0

                );

              if (cost <= 0) {

                return;

              }

              billingItems.push({

                provider:
                  "AWS",

                accountName:
                  account.name,

                accountId:
                  account.accountId,

                service,

                region:
                  "global",

                resourceId:
                  undefined,

                resourceName:
                  undefined,

                usageType:
                  undefined,

                usageQuantity:
                  undefined,

                cost,

                currency:
                  group.Metrics
                    ?.UnblendedCost
                    ?.Unit || "USD",

                month:
                  start.toISOString()
                    .slice(0, 7),

                tags: {

                  [tagKey]:
                    tagValue || "Sin tag"

                }

              });

            });

          }

          return billingItems;

        })

      );

    return results.flat();

  } catch (error) {

    console.error(
      "AWS BILLING ERROR:",
      error
    );

    return [];

  }

}