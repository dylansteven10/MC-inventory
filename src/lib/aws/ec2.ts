import {

  EC2Client,
  DescribeInstancesCommand

} from "@aws-sdk/client-ec2";

import {

  formatAwsTags

} from "./tags";

import type {

  AWSAccount

} from "./accounts";

const region =
  process.env.AWS_REGION || "us-east-1";

export async function getAWSEC2Inventory(

  account: AWSAccount

) {

  const credentials = {

    accessKeyId:
      account.accessKeyId,

    secretAccessKey:
      account.secretAccessKey

  };

  const client =
    new EC2Client({

      region,
      credentials

    });

  const data =
    await client.send(

      new DescribeInstancesCommand({})

    );

  const inventory: any[] = [];

  data.Reservations?.forEach((reservation) => {

    reservation.Instances?.forEach((instance) => {

      const id =
        instance.InstanceId || "";

      inventory.push({

        uniqueKey:
          `AWS-${account.id}-EC2-${id}`,

        provider:
          "AWS",

        accountName:
          account.name,

        accountId:
          account.id,

        service:
          "EC2",

        name:
          instance.Tags?.find(

            (t) => t.Key === "Name"

          )?.Value || "N/A",

        operatingSystem:
          instance.PlatformDetails || "Linux/Unix",

        id,

        host:
          instance.PrivateIpAddress || "N/A",

        status:
          instance.State?.Name || "UNKNOWN",

        tags:
          formatAwsTags(
            instance.Tags
          )

      });

    });

  });

  return inventory;

}