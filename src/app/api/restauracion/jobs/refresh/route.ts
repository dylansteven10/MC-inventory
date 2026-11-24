import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/server";
import { recordApiAudit } from "@/lib/audit/server";
import { queryAudit } from "@/lib/db/pool";
import { getAWSAccounts } from "@/lib/aws/accounts";
import { getHuaweiAccounts } from "@/lib/huawei/accounts";
import { huaweiRequest } from "@/lib/huawei/auth";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";

export const dynamic = "force-dynamic";

/**
 * POST /api/restauracion/jobs/refresh
 * Refresh the status of in-progress restoration jobs.
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:view", request);
  if (guard.response) return guard.response;

  try {
    const jobsRes = await queryAudit(
      `SELECT id, provider, account_id, account_name, restored_resource_id, status
       FROM restore_jobs
       WHERE status IN ('IN_PROGRESS', 'PENDING')`,
    );

    let updated = 0;

    for (const job of jobsRes.rows) {
      try {
        if (job.provider === "AWS" && job.restored_resource_id) {
          // Check EC2 instance status
          const accounts = getAWSAccounts();
          const account = accounts.find((a: any) => a.id === job.account_id || a.name === job.account_name);
          if (account) {
            const ec2Client = new EC2Client({
              region: account.region,
              credentials: { accessKeyId: account.accessKeyId, secretAccessKey: account.secretAccessKey },
            });
            const descResult = await ec2Client.send(new DescribeInstancesCommand({
              InstanceIds: [job.restored_resource_id],
            }));
            const instance = descResult.Reservations?.[0]?.Instances?.[0];
            const state = instance?.State?.Name || "";
            if (state === "running") {
              await queryAudit(`UPDATE restore_jobs SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [job.id]);
              updated++;
            } else if (state === "terminated" || state === "shutting-down") {
              await queryAudit(`UPDATE restore_jobs SET status = 'FAILED', error = 'Instancia terminada' WHERE id = $1`, [job.id]);
              updated++;
            }
            // pending/stopping/stopped = still in progress
          }
        } else if (job.provider === "HUAWEI CLOUD" && job.restored_resource_id) {
          // Check CBR restore job status
          const accounts = getHuaweiAccounts();
          const account = accounts.find((a) => a.projectId === job.account_id || a.name === job.account_name);
          if (account) {
            const cbrHost = `cbr.${account.region}.myhuaweicloud.com`;
            try {
              const restoreRes = await huaweiRequest({
                method: "GET",
                host: cbrHost,
                uri: `/v3/${account.projectId}/restores/${job.restored_resource_id}`,
                ak: account.ak,
                sk: account.sk,
                projectId: account.projectId,
              });
              const restoreStatus = restoreRes.data?.status || "";
              if (restoreStatus === "success" || restoreStatus === "available") {
                const ecsId = restoreRes.data?.resource_id || job.restored_resource_id;
                await queryAudit(
                  `UPDATE restore_jobs SET status = 'COMPLETED', completed_at = now(), restored_resource_id = $1 WHERE id = $2`,
                  [ecsId, job.id],
                );
                updated++;
              } else if (restoreStatus === "fail" || restoreStatus === "error") {
                await queryAudit(
                  `UPDATE restore_jobs SET status = 'FAILED', error = $1 WHERE id = $2`,
                  [`CBR restore failed: ${restoreRes.data?.error_reason || restoreStatus}`, job.id],
                );
                updated++;
              }
            } catch {
              // Fallback: check ECS status directly
              const ecsHost = `ecs.${account.region}.myhuaweicloud.com`;
              try {
                const ecsRes = await huaweiRequest({
                  method: "GET",
                  host: ecsHost,
                  uri: `/v1/${account.projectId}/cloudservers/${job.restored_resource_id}`,
                  ak: account.ak,
                  sk: account.sk,
                  projectId: account.projectId,
                });
                const ecsStatus = ecsRes.data?.server?.status || "";
                if (ecsStatus === "ACTIVE") {
                  await queryAudit(`UPDATE restore_jobs SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [job.id]);
                  updated++;
                } else if (ecsStatus === "ERROR") {
                  await queryAudit(`UPDATE restore_jobs SET status = 'FAILED', error = 'ECS en estado ERROR' WHERE id = $1`, [job.id]);
                  updated++;
                }
              } catch {}
            }
          }
        }
      } catch {
        // Skip individual job errors
      }
    }

    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.jobs.refresh",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
      metadata: { checked: jobsRes.rows.length, updated },
    });

    return NextResponse.json({ checked: jobsRes.rows.length, updated });
  } catch (e: any) {
    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.jobs.refresh",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
    });
    return NextResponse.json({ error: e.message || "Error refreshing jobs" }, { status: 500 });
  }
}
