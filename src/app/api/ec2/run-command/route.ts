import { NextRequest, NextResponse } from "next/server";
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand
} from "@aws-sdk/client-ssm";

const region = process.env.AWS_REGION || "us-east-1";

/* ===============================
   GET ALL ACCOUNTS DYNAMICALLY
=============================== */

function getAllAccounts() {
  const accounts: {
    id: string;
    accessKey: string;
    secretKey: string;
  }[] = [];

  const env = process.env;

  // Detecta AWS_ACCOUNT_X_ID
  Object.keys(env).forEach(key => {
    const match = key.match(/^AWS_ACCOUNT_(\d+)_ID$/);

    if (match) {
      const index = match[1];

      const id = env[`AWS_ACCOUNT_${index}_ID`];
      const accessKey = env[`AWS_ACCOUNT_${index}_ACCESS_KEY`];
      const secretKey = env[`AWS_ACCOUNT_${index}_SECRET_KEY`];

      if (id && accessKey && secretKey) {
        accounts.push({
          id,
          accessKey,
          secretKey
        });
      }
    }
  });

  return accounts;
}

/* ===============================
   GET CREDS PER ACCOUNT
=============================== */

function getCredentials(accountId: string) {
  const accounts = getAllAccounts();

  const acc = accounts.find(a => a.id === accountId);

  if (!acc) {
    throw new Error(`Account not configured: ${accountId}`);
  }

  return {
    accessKeyId: acc.accessKey,
    secretAccessKey: acc.secretKey
  };
}

/* ===============================
   WAIT FOR COMMAND (POLLING)
=============================== */

async function waitForCommand(
  ssm: SSMClient,
  commandId: string,
  instanceId: string
) {
  const maxAttempts = 15; // un poco más robusto
  const delay = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delay));

    try {
      const res = await ssm.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId
        })
      );

      const status = res.Status;

      if (
        status === "Success" ||
        status === "Failed" ||
        status === "Cancelled" ||
        status === "TimedOut"
      ) {
        return res;
      }

    } catch {
      // todavía no está listo → sigue intentando
      continue;
    }
  }

  throw new Error("Timeout waiting for command result");
}

/* ===============================
   API
=============================== */

export async function POST(req: NextRequest) {
  try {
    const { instances, command } = await req.json();

    if (!instances?.length || !command) {
      return NextResponse.json(
        { error: "Missing instances or command" },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const instance of instances) {
      try {
        const creds = getCredentials(instance.accountId);

        const ssm = new SSMClient({
          region,
          credentials: creds
        });

        /* ================= SEND COMMAND ================= */

        const send = await ssm.send(
          new SendCommandCommand({
            InstanceIds: [instance.instanceId],
            DocumentName: "AWS-RunShellScript",
            Parameters: {
              commands: [command]
            }
          })
        );

        const commandId = send.Command?.CommandId;

        if (!commandId) {
          throw new Error("No commandId returned");
        }

        /* ================= WAIT RESULT ================= */

        const result = await waitForCommand(
          ssm,
          commandId,
          instance.instanceId
        );

        results.push({
          instanceId: instance.instanceId,
          accountId: instance.accountId,
          output: result.StandardOutputContent || "",
          error: result.StandardErrorContent || ""
        });

      } catch (err: any) {
        console.error(
          `Error on ${instance.instanceId}:`,
          err.message
        );

        results.push({
          instanceId: instance.instanceId,
          accountId: instance.accountId,
          error: "❌ No SSM connection or instance unreachable"
        });
      }
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error("Global error:", error);

    return NextResponse.json(
      { error: "Command execution failed" },
      { status: 500 }
    );
  }
}