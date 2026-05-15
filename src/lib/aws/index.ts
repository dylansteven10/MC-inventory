import {
  getAWSAccounts
} from "./accounts";

import {
  getAWSEC2Inventory
} from "./ec2";

import {
  getAWSRDSInventory
} from "./rds";

import {
  getAWSS3Inventory
} from "./s3";

import {
  getAWSVPCInventory
} from "./vpc";

import {
  getAWSSubnetInventory
} from "./subnet";

import {
  getAWSELBInventory
} from "./elb";

export async function getAWSInventory() {

  const accounts =
    getAWSAccounts();

  console.log(
    `AWS ACCOUNTS: ${accounts.length}`
  );

  const accountResults =
    await Promise.all(

      accounts.map(
        async (account) => {

          console.log(
            `Loading AWS account: ${account.name}`
          );

          const [

            ec2,
            rds,
            s3,
            vpc,
            subnet,
            elb

          ] = await Promise.all([

            getAWSEC2Inventory(account),

            getAWSRDSInventory(account),

            getAWSS3Inventory(account),

            getAWSVPCInventory(account),

            getAWSSubnetInventory(account),

            getAWSELBInventory(account)

          ]);

          return [

            ...ec2,
            ...rds,
            ...s3,
            ...vpc,
            ...subnet,
            ...elb

          ];

        }
      )

    );

  return accountResults.flat();

}