import { NextResponse } from "next/server";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { ECSClient, ListClustersCommand } from "@aws-sdk/client-ecs";
import { CloudFrontClient, ListDistributionsCommand } from "@aws-sdk/client-cloudfront";

const region = process.env.AWS_REGION;

export async function GET() {
  try {
    const ec2Client = new EC2Client({ region });
    const rdsClient = new RDSClient({ region });
    const ecsClient = new ECSClient({ region });
    const cloudfrontClient = new CloudFrontClient({ region });

    const inventory: any[] = [];

    // EC2
    const ec2Data = await ec2Client.send(new DescribeInstancesCommand({}));
    ec2Data.Reservations?.forEach(reservation => {
      reservation.Instances?.forEach(instance => {
        inventory.push({
          service: "EC2",
          name: instance.Tags?.find(t => t.Key === "Name")?.Value || "N/A",
          id: instance.InstanceId,
          host: instance.PrivateIpAddress || "N/A",
          status: instance.State?.Name
        });
      });
    });

    // RDS
    const rdsData = await rdsClient.send(new DescribeDBInstancesCommand({}));
    rdsData.DBInstances?.forEach(db => {
      inventory.push({
        service: "RDS",
        name: db.DBInstanceIdentifier,
        id: db.DBInstanceIdentifier,
        host: db.Endpoint?.Address || "N/A",
        status: db.DBInstanceStatus
      });
    });

    // ECS
    const clusters = await ecsClient.send(new ListClustersCommand({}));
    clusters.clusterArns?.forEach(cluster => {
      inventory.push({
        service: "ECS",
        name: cluster.split("/").pop(),
        id: cluster,
        host: "N/A",
        status: "Active"
      });
    });

    // CloudFront
    const cfData = await cloudfrontClient.send(new ListDistributionsCommand({}));
    cfData.DistributionList?.Items?.forEach(dist => {
      inventory.push({
        service: "CloudFront",
        name: dist.Comment || "N/A",
        id: dist.Id,
        host: dist.DomainName,
        status: dist.Status
      });
    });

    return NextResponse.json(inventory);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error fetching AWS inventory" }, { status: 500 });
  }
}