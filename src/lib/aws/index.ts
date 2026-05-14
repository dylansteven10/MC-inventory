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

  const inventory: any[] = [];

  for (const account of accounts) {

    const ec2 =
      await getAWSEC2Inventory(account);

    const rds =
      await getAWSRDSInventory(account);

    const s3 =
      await getAWSS3Inventory(account);

    const vpc =
      await getAWSVPCInventory(account);

    const subnet =
      await getAWSSubnetInventory(account);

    const elb =
      await getAWSELBInventory(account);

    inventory.push(

      ...ec2,
      ...rds,
      ...s3,
      ...vpc,
      ...subnet,
      ...elb

    );

  }

  return inventory;

}