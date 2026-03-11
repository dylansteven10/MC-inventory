import { NextRequest, NextResponse } from "next/server";
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from "@aws-sdk/client-ssm";

const region = process.env.AWS_REGION || "us-east-1";

function getCredentials(accountId: string) {

  const accounts = [
    {
      id: process.env.AWS_ACCOUNT_1_ID,
      accessKey: process.env.AWS_ACCOUNT_1_ACCESS_KEY,
      secretKey: process.env.AWS_ACCOUNT_1_SECRET_KEY
    },
    {
      id: process.env.AWS_ACCOUNT_2_ID,
      accessKey: process.env.AWS_ACCOUNT_2_ACCESS_KEY,
      secretKey: process.env.AWS_ACCOUNT_2_SECRET_KEY
    }
  ];

  const account = accounts.find(a => a.id === accountId);

  if (!account) throw new Error("Account not configured");

  return {
    accessKeyId: account.accessKey!,
    secretAccessKey: account.secretKey!
  };

}

export async function POST(req: NextRequest) {

  try {

    const { instances, command } = await req.json();

    const results:any[] = [];

    for (const instance of instances) {

      const creds = getCredentials(instance.accountId);

      const ssm = new SSMClient({
        region,
        credentials: creds
      });

      const send = await ssm.send(new SendCommandCommand({

        InstanceIds: [instance.instanceId],

        DocumentName: "AWS-RunShellScript",

        Parameters: {
          commands: [command]
        }

      }));

      const commandId = send.Command?.CommandId;

      await new Promise(r => setTimeout(r, 2000));

      const output = await ssm.send(new GetCommandInvocationCommand({

        CommandId: commandId!,
        InstanceId: instance.instanceId

      }));

      results.push({
        instanceId: instance.instanceId,
        accountId: instance.accountId,
        output: output.StandardOutputContent,
        error: output.StandardErrorContent
      });

    }

    return NextResponse.json(results);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      { error: "Command execution failed" },
      { status: 500 }
    );

  }

}