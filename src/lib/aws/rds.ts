import {

  RDSClient,
  DescribeDBInstancesCommand,
  ListTagsForResourceCommand

} from "@aws-sdk/client-rds";

import {

  formatAwsTags

} from "./tags";

import type {

  AWSAccount

} from "./accounts";

const region =
  process.env.AWS_REGION || "us-east-1";

export async function getAWSRDSInventory(

  account: AWSAccount

) {

  try {

    const credentials = {

      accessKeyId:
        account.accessKeyId,

      secretAccessKey:
        account.secretAccessKey

    };

    const client =
      new RDSClient({

        region,
        credentials

      });

    const data =
      await client.send(

        new DescribeDBInstancesCommand({})

      );

    return await Promise.all(

      (data.DBInstances || []).map(

        async (db) => {

          const id =
            db.DBInstanceIdentifier || "";

          let tags: Record<string, string> = {};

          try {

            const arn =
              db.DBInstanceArn;

            if (arn) {

              const tagData =
                await client.send(

                  new ListTagsForResourceCommand({

                    ResourceName:
                      arn

                  })

                );

              tags =
                formatAwsTags(
                  tagData.TagList || []
                );

            }

          } catch {

            tags = {};

          }

          return {

            uniqueKey:
              `AWS-${account.id}-RDS-${id}`,

            provider:
              "AWS",

            accountName:
              account.name,

            accountId:
              account.id,

            service:
              "RDS",

            name:
              id,

            operatingSystem:
              db.Engine || "N/A",

            id,

            host:
              db.Endpoint?.Address || "N/A",

            status:
              db.DBInstanceStatus || "UNKNOWN",

            securityGroups:

              (
                db.VpcSecurityGroups || []
              ).map((sg) => ({

                id:
                  sg.VpcSecurityGroupId || "N/A",

                name:
                  sg.Status || "attached"

              })),

            tags

          };

        }

      )

    );

  } catch (error: any) {

    console.error(

      "AWS RDS ERROR:",

      error?.message || error

    );

    return [];

  }

}