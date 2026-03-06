import { NextResponse } from "next/server";

import { EC2Client, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand } from "@aws-sdk/client-ec2";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { ECSClient, ListClustersCommand } from "@aws-sdk/client-ecs";
import { CloudFrontClient, ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from "@aws-sdk/client-elastic-load-balancing-v2";

import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { IAMClient, ListAccountAliasesCommand } from "@aws-sdk/client-iam";

const region = process.env.AWS_REGION || "us-east-1";

/* =================================
   GET ACCOUNTS FROM ENV
================================= */

function getAccounts() {

  const accounts = [];
  let i = 1;

  while (process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY`]) {

    accounts.push({
      accessKeyId: process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY`]!,
      secretAccessKey: process.env[`AWS_ACCOUNT_${i}_SECRET_KEY`]!,
    });

    i++;

  }

  return accounts;
}

/* =================================
   API ROUTE
================================= */

export async function GET() {

  try {

    const accounts = getAccounts();
    const inventory: any[] = [];

    for (const account of accounts) {

      /* ===============================
         AWS CLIENTS
      =============================== */

      const credentials = {
        accessKeyId: account.accessKeyId,
        secretAccessKey: account.secretAccessKey
      };

      const ec2Client = new EC2Client({ region, credentials });
      const rdsClient = new RDSClient({ region, credentials });
      const ecsClient = new ECSClient({ region, credentials });
      const cloudfrontClient = new CloudFrontClient({ region, credentials });
      const s3Client = new S3Client({ region, credentials });
      const elbClient = new ElasticLoadBalancingV2Client({ region, credentials });

      const stsClient = new STSClient({ region, credentials });
      const iamClient = new IAMClient({ region, credentials });

      /* ===============================
         ACCOUNT INFO
      =============================== */

      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      const accountId = identity.Account || "Unknown";

      let accountName = "N/A";

      try {

        const aliasData = await iamClient.send(new ListAccountAliasesCommand({}));
        accountName = aliasData.AccountAliases?.[0] || "N/A";

      } catch {}

      /* ===============================
         EC2
      =============================== */

      const ec2Data = await ec2Client.send(new DescribeInstancesCommand({}));

      ec2Data.Reservations?.forEach(reservation => {

        reservation.Instances?.forEach(instance => {

          inventory.push({
            accountName,
            accountId,
            service: "EC2",
            name: instance.Tags?.find(t => t.Key === "Name")?.Value || "N/A",
            id: instance.InstanceId,
            host: instance.PrivateIpAddress || "N/A",
            status: instance.State?.Name
          });

        });

      });

      /* ===============================
         RDS
      =============================== */

      const rdsData = await rdsClient.send(new DescribeDBInstancesCommand({}));

      rdsData.DBInstances?.forEach(db => {

        inventory.push({
          accountName,
          accountId,
          service: "RDS",
          name: db.DBInstanceIdentifier,
          id: db.DBInstanceIdentifier,
          host: db.Endpoint?.Address || "N/A",
          status: db.DBInstanceStatus
        });

      });

      /* ===============================
         ECS
      =============================== */

      const clusters = await ecsClient.send(new ListClustersCommand({}));

      clusters.clusterArns?.forEach(cluster => {

        inventory.push({
          accountName,
          accountId,
          service: "ECS",
          name: cluster.split("/").pop(),
          id: cluster,
          host: "N/A",
          status: "active"
        });

      });

      /* ===============================
         CloudFront
      =============================== */

      const cfData = await cloudfrontClient.send(new ListDistributionsCommand({}));

      cfData.DistributionList?.Items?.forEach(dist => {

        inventory.push({
          accountName,
          accountId,
          service: "CloudFront",
          name: dist.Comment || "N/A",
          id: dist.Id,
          host: dist.DomainName,
          status: dist.Status
        });

      });

      /* ===============================
         S3
      =============================== */

      const buckets = await s3Client.send(new ListBucketsCommand({}));

      buckets.Buckets?.forEach(bucket => {

        inventory.push({
          accountName,
          accountId,
          service: "S3",
          name: bucket.Name,
          id: bucket.Name,
          host: "N/A",
          status: "available"
        });

      });

      /* ===============================
         LOAD BALANCERS
      =============================== */

      const lbs = await elbClient.send(new DescribeLoadBalancersCommand({}));

      lbs.LoadBalancers?.forEach(lb => {

        inventory.push({
          accountName,
          accountId,
          service: "LoadBalancer",
          name: lb.LoadBalancerName,
          id: lb.LoadBalancerArn,
          host: lb.DNSName,
          status: lb.State?.Code
        });

      });

      /* ===============================
         VPC
      =============================== */

      const vpcs = await ec2Client.send(new DescribeVpcsCommand({}));

      vpcs.Vpcs?.forEach(vpc => {

        const nameTag = vpc.Tags?.find(tag => tag.Key === "Name");

        inventory.push({
          accountName,
          accountId,
          service: "VPC",
          name: nameTag?.Value || "N/A",
          id: vpc.VpcId,
          host: vpc.CidrBlock,
          status: vpc.State
        });

      });

      /* ===============================
         SUBNET
      =============================== */

      const subnets = await ec2Client.send(new DescribeSubnetsCommand({}));

      subnets.Subnets?.forEach(subnet => {

        const nameTag = subnet.Tags?.find(tag => tag.Key === "Name");

        inventory.push({
          accountName,
          accountId,
          service: "Subnet",
          name: nameTag?.Value || "N/A",
          id: subnet.SubnetId,
          host: subnet.CidrBlock,
          status: subnet.State
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