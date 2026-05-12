import {
  huaweiRequest
} from "./auth";

import {
  HUAWEI_ACCOUNT_MAP
} from "@/lib/huawei/accounts";

import {
  getHuaweiTags
} from "./tags";

export async function getHuaweiSubnetInventory() {

  try {

    const projectId =
      process.env.HUAWEI_ACCOUNT_1_PROJECT_ID!;

    const data =
      await huaweiRequest({

        method: "GET",

        host:
          "vpc.la-north-2.myhuaweicloud.com",

        uri:
          `/v1/${projectId}/subnets`

      });

    if (!data) {

      return [];

    }

    const subnets =
      data.subnets || [];

    console.log(
      "HUAWEI SUBNET COUNT:",
      subnets.length
    );

    return await Promise.all(

      subnets.map(async (subnet: any) => {

        const tenantId =
          subnet.tenant_id || projectId;

        const subnetId =
          subnet.id || "N/A";

        const tags =
          await getHuaweiTags({

            host:
              "vpc.la-north-2.myhuaweicloud.com",

            uri:
              `/v2.0/${tenantId}/subnets/${subnetId}/tags`

          });

        return {

          uniqueKey:
            `HUAWEI-${tenantId}-SUBNET-${subnetId}`,

          provider:
            "HUAWEI CLOUD",

          accountName:
            HUAWEI_ACCOUNT_MAP[
              tenantId
            ] || "unknown",

          accountId:
            tenantId,

          service:
            "Subnet",

          name:
            subnet.name || "N/A",

          id:
            subnetId,

          host:
            subnet.cidr || "N/A",

          status:
            subnet.status || "UNKNOWN",

          operatingSystem:
            "N/A",

          tags

        };

      })

    );

  } catch (error: any) {

    console.error(
      "HUAWEI SUBNET ERROR:",
      error?.response?.data || error
    );

    return [];

  }

}