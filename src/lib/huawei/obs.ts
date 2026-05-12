import ObsClient from "esdk-obs-nodejs";

import {
  getHuaweiAccounts
} from "@/lib/huawei/accounts";

export async function getHuaweiOBSInventory() {

  try {

    const accounts =
      getHuaweiAccounts();

    const inventory =
      await Promise.all(

        accounts.map(async (account) => {

          const obsClient =
            new ObsClient({

              access_key_id:
                account.ak,

              secret_access_key:
                account.sk,

              server:
                "https://obs.la-north-2.myhuaweicloud.com"

            });

          const result =
            await obsClient.listBuckets();

          console.log(
            `HUAWEI OBS STATUS (${account.name}):`,
            result.CommonMsg.Status
          );

          const buckets =
            result.InterfaceResult?.Buckets || [];

          console.log(
            `HUAWEI OBS COUNT (${account.name}):`,
            buckets.length
          );

          return buckets.map((bucket: any) => {

            const bucketName =
              bucket.BucketName ||
              bucket.Name ||
              bucket.name ||
              "unknown-bucket";

            return {

              uniqueKey:
                `HUAWEI-${account.projectId}-OBS-${bucketName}`,

              provider:
                "HUAWEI CLOUD",

              accountName:
                account.name,

              accountId:
                account.projectId,

              service:
                "OBS",

              name:
                bucketName,

              id:
                bucketName,

              host:
                "N/A",

              status:
                "available",

              operatingSystem:
                "N/A",

              tags: {}

            };

          });

        })

      );

    return inventory.flat();

  } catch (error: any) {

    console.error(
      "HUAWEI OBS ERROR:",
      error
    );

    return [];

  }

}