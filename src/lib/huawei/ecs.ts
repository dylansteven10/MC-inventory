import {
  huaweiRequest
} from "./auth";

import {
  HUAWEI_ACCOUNT_MAP
} from "@/lib/huawei/accounts";

export async function getHuaweiECSInventory() {

  try {

    const projectId =
      process.env.HUAWEI_ACCOUNT_1_PROJECT_ID!;

    const data =
      await huaweiRequest({

        method: "GET",

        host:
          "ecs.la-north-2.myhuaweicloud.com",

        uri:
          `/v1/${projectId}/cloudservers/detail`

      });

    if (!data) {

      return [];

    }

    const servers =
      data.servers || [];

    console.log(
      "HUAWEI ECS COUNT:",
      servers.length
    );

    return servers.map((server: any) => {

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

      const tenantId =
        server.tenant_id || projectId;

      return {

        uniqueKey:
          `HUAWEI-${tenantId}-ECS-${serverId}`,

        provider:
          "HUAWEI CLOUD",

        accountName:
          HUAWEI_ACCOUNT_MAP[
            tenantId
          ] || "unknown",

        accountId:
          tenantId,

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
          "Linux"

      };

    });

  } catch (error: any) {

    console.error(
      "HUAWEI ECS ERROR:",
      error?.response?.data || error
    );

    return [];

  }

}