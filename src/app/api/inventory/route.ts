import { NextResponse } from "next/server";

import { getAWSInventory } from "@/lib/aws";

import {
  getHuaweiECSInventory
} from "@/lib/huawei/ecs";

import {
  getHuaweiRDSInventory
} from "@/lib/huawei/rds";

import {
  getHuaweiVPCInventory
} from "@/lib/huawei/vpc";

import {
  getHuaweiSubnetInventory
} from "@/lib/huawei/subnet";

import {
  getHuaweiOBSInventory
} from "@/lib/huawei/obs";

export async function GET() {

  try {

    const awsInventory =
      await getAWSInventory();

    const huaweiECS =
      await getHuaweiECSInventory();

    const huaweiRDS =
      await getHuaweiRDSInventory();

    const huaweiVPC =
      await getHuaweiVPCInventory();

    const huaweiSubnet =
      await getHuaweiSubnetInventory();

    const huaweiOBS =
      await getHuaweiOBSInventory();

    return NextResponse.json([

      ...awsInventory,

      ...huaweiECS,
      ...huaweiRDS,
      ...huaweiVPC,
      ...huaweiSubnet,
      ...huaweiOBS

    ]);

  } catch (error) {

    console.error(error);

    return NextResponse.json(

      {

        error:
          "Error fetching inventory"

      },

      {

        status: 500

      }

    );

  }

}