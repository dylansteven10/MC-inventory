export type BillingTagMap = {

  Cliente?: string;

  Proyecto?: string;

  Environment?: string;

  Owner?: string;

  CostCenter?: string;

  Application?: string;

  [key: string]: string | undefined;

};

export type BillingItem = {

  provider: string;

  accountName: string;

  accountId: string;

  service: string;

  region?: string;

  resourceId?: string;

  resourceName?: string;

  usageType?: string;

  usageQuantity?: number;

  cost: number;

  currency: string;

  month: string;

  tags?: BillingTagMap;

};