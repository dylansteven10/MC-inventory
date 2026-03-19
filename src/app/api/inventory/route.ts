import { NextResponse } from "next/server";

import fs from "fs";
import path from "path";

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand
} from "@aws-sdk/client-ec2";

import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { ECSClient } from "@aws-sdk/client-ecs";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";

const region = process.env.AWS_REGION || "us-east-1";

/* ===============================
   LOAD LOCAL META DB
=============================== */

const metaPath = path.join(process.cwd(), "data/inventory-meta.json");

let meta: Record<string, any> = {};
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
}

/* ===============================
   ACCOUNTS (🔥 DESDE .ENV)
=============================== */

function getAccounts() {
  const accounts = [];
  let i = 1;

  while (process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY`]) {
    accounts.push({
      name: process.env[`AWS_ACCOUNT_${i}_NAME`] || "N/A",
      id: process.env[`AWS_ACCOUNT_${i}_ID`] || "N/A",
      accessKeyId: process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY`]!,
      secretAccessKey: process.env[`AWS_ACCOUNT_${i}_SECRET_KEY`]!,
    });
    i++;
  }

  return accounts;
}

/* ===============================
   HELPER: TAG CLIENTE
=============================== */

function getClienteTag(tags: any[] = []) {
  const tag = tags.find((t) => t.Key === "cliente");
  return tag?.Value || "N/A";
}

/* ===============================
   API
=============================== */

export async function GET() {
  try {
    const accounts = getAccounts();
    const inventory: any[] = [];

    for (const account of accounts) {
      const credentials = {
        accessKeyId: account.accessKeyId,
        secretAccessKey: account.secretAccessKey,
      };

      const ec2Client = new EC2Client({ region, credentials });
      const rdsClient = new RDSClient({ region, credentials });
      const ecsClient = new ECSClient({ region, credentials });
      const cloudfrontClient = new CloudFrontClient({ region, credentials });
      const s3Client = new S3Client({ region, credentials });
      const elbClient = new ElasticLoadBalancingV2Client({ region, credentials });

      const accountId = account.id;
      const accountName = account.name;

      /* ================= EC2 ================= */

      const ec2Data = await ec2Client.send(new DescribeInstancesCommand({}));

      ec2Data.Reservations?.forEach((reservation) => {
        reservation.Instances?.forEach((instance) => {
          const id = instance.InstanceId || "";

          inventory.push({
            accountName,
            accountId,
            service: "EC2",
            name: instance.Tags?.find((t) => t.Key === "Name")?.Value || "N/A",
            description: meta[id]?.description || "",
            internalSoftwares: meta[id]?.internalSoftwares || "",
            operatingSystem: instance.PlatformDetails || "Linux/Unix",
            responsibleCompany: getClienteTag(instance.Tags),
            id,
            host: instance.PrivateIpAddress || "N/A",
            status: instance.State?.Name,
          });
        });
      });

      /* ================= RDS ================= */

      const rdsData = await rdsClient.send(new DescribeDBInstancesCommand({}));

      rdsData.DBInstances?.forEach((db) => {
        const id = db.DBInstanceIdentifier || "";

        inventory.push({
          accountName,
          accountId,
          service: "RDS",
          name: id,
          description: meta[id]?.description || "",
          internalSoftwares: meta[id]?.internalSoftwares || "",
          operatingSystem: db.Engine || "N/A",
          responsibleCompany: "N/A",
          id,
          host: db.Endpoint?.Address || "N/A",
          status: db.DBInstanceStatus,
        });
      });

      /* ================= S3 ================= */

      const buckets = await s3Client.send(new ListBucketsCommand({}));

      buckets.Buckets?.forEach((bucket) => {
        const id = bucket.Name || "";

        inventory.push({
          accountName,
          accountId,
          service: "S3",
          name: id,
          description: meta[id]?.description || "",
          internalSoftwares: meta[id]?.internalSoftwares || "",
          operatingSystem: "N/A",
          responsibleCompany: "N/A",
          id,
          host: "N/A",
          status: "available",
        });
      });

      /* ================= VPC ================= */

      const vpcs = await ec2Client.send(new DescribeVpcsCommand({}));

      vpcs.Vpcs?.forEach((vpc) => {
        const id = vpc.VpcId || "";

        inventory.push({
          accountName,
          accountId,
          service: "VPC",
          name: vpc.Tags?.find((t) => t.Key === "Name")?.Value || "N/A",
          description: meta[id]?.description || "",
          internalSoftwares: meta[id]?.internalSoftwares || "",
          operatingSystem: "N/A",
          responsibleCompany: getClienteTag(vpc.Tags),
          id,
          host: vpc.CidrBlock,
          status: vpc.State,
        });
      });

      /* ================= SUBNET ================= */

      const subnets = await ec2Client.send(new DescribeSubnetsCommand({}));

      subnets.Subnets?.forEach((subnet) => {
        const id = subnet.SubnetId || "";

        inventory.push({
          accountName,
          accountId,
          service: "Subnet",
          name: subnet.Tags?.find((t) => t.Key === "Name")?.Value || "N/A",
          description: meta[id]?.description || "",
          internalSoftwares: meta[id]?.internalSoftwares || "",
          operatingSystem: "N/A",
          responsibleCompany: getClienteTag(subnet.Tags),
          id,
          host: subnet.CidrBlock,
          status: subnet.State,
        });
      });
    }

    return NextResponse.json(inventory);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Error fetching AWS inventory" },
      { status: 500 }
    );
  }
}