import {
  NextResponse
} from "next/server";

import {
  getAWSBilling
} from "@/lib/billing/aws";

import {
  getHuaweiBilling
} from "@/lib/billing/huawei";

export async function GET() {

  try {

    const [

      awsBilling,
      huaweiBilling

    ] = await Promise.all([

      getAWSBilling(),
      getHuaweiBilling()

    ]);

    return NextResponse.json({

      success: true,

      data: [

        ...awsBilling,
        ...huaweiBilling

      ]

    });

  } catch (error) {

    console.error(
      "BILLING API ERROR:",
      error
    );

    return NextResponse.json(

      {
        success: false
      },

      {
        status: 500
      }

    );

  }

}