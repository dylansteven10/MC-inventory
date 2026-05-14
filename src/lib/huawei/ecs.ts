import {
  huaweiRequest
} from "./auth";

import {
  getHuaweiAccounts
} from "./accounts";

import {
  getHuaweiTags
} from "./tags";

export async function getHuaweiECSInventory() {

  try {

    const accounts =
      getHuaweiAccounts();

    const inventory =
      await Promise.all(

        accounts.map(async (account) => {

          const data =
            await huaweiRequest({

              method: "GET",

              host:
                "ecs.la-north-2.myhuaweicloud.com",

              uri:
                `/v1/${account.projectId}/cloudservers/detail`,

              ak:
                account.ak,

              sk:
                account.sk,

              projectId:
                account.projectId

            });

          if (!data) {

            return [];

          }

          const servers =
            data.servers || [];

          return await Promise.all(

            servers.map(async (server: any) => {

              let hostIp = "N/A";

              if (server.addresses) {

                const networks =
                  Object.values(
                    server.addresses
                  ) as any[];

                if (
                  networks.length > 0 &&
                  networks[0].length > 0
                ) {

                  hostIp =
                    networks[0][0]?.addr || "N/A";

                }

              }

              const serverId =
                server.id || "N/A";

              const tags =
                await getHuaweiTags({

                  host:
                    "ecs.la-north-2.myhuaweicloud.com",

                  uri:
                    `/v1/${account.projectId}/cloudservers/${serverId}/tags`,

                  ak:
                    account.ak,

                  sk:
                    account.sk,

                  projectId:
                    account.projectId

                });

              return {

                uniqueKey:
                  `HUAWEI-${account.projectId}-ECS-${serverId}`,

                provider:
                  "HUAWEI CLOUD",

                accountName:
                  account.name,

                accountId:
                  account.projectId,

                service:
                  "ECS",

                name:
                  server.name || "N/A",

                id:
                  serverId,

                host:
                  hostIp,

                status:
                  server.status || "UNKNOWN",

                operatingSystem:
                  "Linux",

                securityGroups:

                  (server.security_groups || []).map((sg: any) => ({

                    id:
                      sg.id || "N/A",

                    name:
                      sg.name || "N/A"

                  })),

                tags

              };

            })

          );

        })

      );

    return inventory.flat();

  } catch (error: any) {

    console.error(
      "HUAWEI ECS ERROR:",
      error?.response?.data || error
    );

    return [];

  }

}