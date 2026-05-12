export type AWSAccount = {

  name: string;

  id: string;

  accessKeyId: string;

  secretAccessKey: string;

};

export function getAWSAccounts(): AWSAccount[] {

  const accounts: AWSAccount[] = [];

  let i = 1;

  while (

    process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY`]

  ) {

    accounts.push({

      name:
        process.env[`AWS_ACCOUNT_${i}_NAME`] || "N/A",

      id:
        process.env[`AWS_ACCOUNT_${i}_ID`] || "N/A",

      accessKeyId:
        process.env[`AWS_ACCOUNT_${i}_ACCESS_KEY`]!,

      secretAccessKey:
        process.env[`AWS_ACCOUNT_${i}_SECRET_KEY`]!

    });

    i++;

  }

  return accounts;

}