import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/server";
import { generateInformeData } from "@/lib/email/informe";
import { generateRdsInformeData } from "@/lib/email/informe-rds";
import { generateLogsInformeData } from "@/lib/email/informe-logs";
import { generateVaultsInformeData } from "@/lib/email/informe-vaults";
import { isSendGridConfigured } from "@/lib/email/sendgrid";

export async function GET(request: Request) {
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  const [servers, rds, logs, vaults, sendGridConfigured] = await Promise.all([
    generateInformeData(),
    generateRdsInformeData(),
    generateLogsInformeData(),
    generateVaultsInformeData(),
    isSendGridConfigured(),
  ]);

  return NextResponse.json({
    servers,
    rds,
    logs,
    vaults,
    sendGridConfigured,
  });
}
