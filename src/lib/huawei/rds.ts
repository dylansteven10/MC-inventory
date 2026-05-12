import {
  huaweiRequest
} from "./auth";

import {
  HUAWEI_ACCOUNT_MAP
} from "@/lib/huawei/accounts";

import {
  getHuaweiTags
} from "./tags";

export async function getHuaweiRDSInventory() {

  try {

    const projectId =
      process.env.HUAWEI_ACCOUNT_1_PROJECT_ID!;

    const data =
      await huaweiRequest({

        method: "GET",

        host:
          "rds.la-north-2.myhuaweicloud.com",

        uri:
          `/v3/${projectId}/instances`

      });

    if (!data) {

      return [];

    }

    const instances =
      data.instances || [];

    console.log(
      "HUAWEI RDS COUNT:",
      instances.length
    );

    return await Promise.all(

      instances.map(async (db: any) => {

        const dbId =
          db.id || "N/A";

        const tags =
          await getHuaweiTags({

            host:
              "rds.la-north-2.myhuaweicloud.com",

            uri:
              `/v3/${projectId}/instances/${dbId}/tags`

          });

        return {

          uniqueKey:
            `HUAWEI-${projectId}-RDS-${dbId}`,

          provider:
            "HUAWEI CLOUD",

          accountName:
            HUAWEI_ACCOUNT_MAP[
              projectId
            ] || "unknown",

          accountId:
            projectId,

          service:
            "RDS",

          name:
            db.name || "N/A",

          id:
            dbId,

          host:
            db.private_ips?.[0] || "N/A",

          status:
            db.status || "UNKNOWN",

          operatingSystem:
            `${db.datastore?.type || "RDS"} ${db.datastore?.version || ""}`,

          tags

        };

      })

    );

  } catch (error: any) {

    console.error(
      "HUAWEI RDS ERROR:",
      error?.response?.data || error
    );

    return [];

  }

}