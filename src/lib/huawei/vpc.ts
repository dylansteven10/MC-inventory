import {
  huaweiRequest
} from "./auth";

import {
  HUAWEI_ACCOUNT_MAP
} from "@/lib/huawei/accounts";

import {
  getHuaweiTags
} from "./tags";

export async function getHuaweiVPCInventory() {

  try {

    const projectId =
      process.env.HUAWEI_ACCOUNT_1_PROJECT_ID!;

    const data =
      await huaweiRequest({

        method: "GET",

        host:
          "vpc.la-north-2.myhuaweicloud.com",

        uri:
          `/v1/${projectId}/vpcs`

      });

    if (!data) {

      return [];

    }

    const vpcs =
      data.vpcs || [];

    console.log(
      "HUAWEI VPC COUNT:",
      vpcs.length
    );

    return await Promise.all(

      vpcs.map(async (vpc: any) => {

        const tenantId =
          vpc.tenant_id || projectId;

        const vpcId =
          vpc.id || "N/A";

        const tags =
          await getHuaweiTags({

            host:
              "vpc.la-north-2.myhuaweicloud.com",

            uri:
              `/v2.0/${tenantId}/vpcs/${vpcId}/tags`

          });

        return {

          uniqueKey:
            `HUAWEI-${tenantId}-VPC-${vpcId}`,

          provider:
            "HUAWEI CLOUD",

          accountName:
            HUAWEI_ACCOUNT_MAP[
              tenantId
            ] || "unknown",

          accountId:
            tenantId,

          service:
            "VPC",

          name:
            vpc.name || "N/A",

          id:
            vpcId,

          host:
            vpc.cidr || "N/A",

          status:
            vpc.status || "UNKNOWN",

          operatingSystem:
            "N/A",

          tags

        };

      })

    );

  } catch (error: any) {

    console.error(
      "HUAWEI VPC ERROR:",
      error?.response?.data || error
    );

    return [];

  }

}