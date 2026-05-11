import {
  huaweiRequest
} from "./auth";

import {
  HUAWEI_ACCOUNT_MAP
} from "@/lib/huawei/accounts";

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

    return vpcs.map((vpc: any) => {

      const tenantId =
        vpc.tenant_id || projectId;

      return {

        uniqueKey:
          `HUAWEI-${tenantId}-VPC-${vpc.id}`,

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
          vpc.id || "N/A",

        host:
          vpc.cidr || "N/A",

        status:
          vpc.status || "UNKNOWN",

        operatingSystem:
          "N/A"

      };

    });

  } catch (error: any) {

    console.error(
      "HUAWEI VPC ERROR:",
      error?.response?.data || error
    );

    return [];

  }

}