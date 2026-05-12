import ObsClient from "esdk-obs-nodejs";

import {
  HUAWEI_ACCOUNT_MAP
} from "@/lib/huawei/accounts";

export async function getHuaweiOBSInventory() {

  try {

    const projectId =
      process.env.HUAWEI_ACCOUNT_1_PROJECT_ID!;

    const obsClient =
      new ObsClient({

        access_key_id:
          process.env.HUAWEI_ACCOUNT_1_AK!,

        secret_access_key:
          process.env.HUAWEI_ACCOUNT_1_SK!,

        server:
          "https://obs.la-north-2.myhuaweicloud.com"

      });

    const result =
      await obsClient.listBuckets();

    console.log(
      "HUAWEI OBS STATUS:",
      result.CommonMsg.Status
    );

    const buckets =
      result.InterfaceResult?.Buckets || [];

    console.log(
      "HUAWEI OBS COUNT:",
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
          `HUAWEI-OBS-${bucketName}`,

        provider:
          "HUAWEI CLOUD",

        accountName:
          HUAWEI_ACCOUNT_MAP[
            projectId
          ] || "unknown",

        accountId:
          projectId,

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

  } catch (error: any) {

    console.error(
      "HUAWEI OBS ERROR:",
      error
    );

    return [];

  }

}