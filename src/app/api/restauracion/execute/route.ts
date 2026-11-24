import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/server";
import { recordApiAudit } from "@/lib/audit/server";
import { queryAudit } from "@/lib/db/pool";
import { getAWSAccounts } from "@/lib/aws/accounts";
import { getHuaweiAccounts } from "@/lib/huawei/accounts";
import { huaweiRequest } from "@/lib/huawei/auth";
import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  CreateTagsCommand,
} from "@aws-sdk/client-ec2";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/restauracion/execute
 * Initiate a restoration from a backup.
 *
 * AWS: The backup_id is an AMI ARN → extract AMI ID → RunInstances with -restaurado suffix
 * Huawei: Convert CBR backup to image → create ECS from image with -restaurado suffix
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireApiSession("inventory:modify", request);
  if (guard.response) return guard.response;

  try {
    const body = await request.json();
    const { provider, accountId, accountName, region, backupId, resourceId, resourceName, resourceType } = body;

    if (!provider || !backupId || !resourceId || !resourceName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const restoredName = resourceName + "-restaurado";

    if (provider === "AWS") {
      return await executeAwsRestore(request, guard, startedAt, {
        accountId, accountName, region, backupId, resourceId, resourceName, restoredName,
      });
    }

    if (provider === "HUAWEI CLOUD") {
      return await executeHuaweiRestore(request, guard, startedAt, {
        accountId, accountName, region, backupId, resourceId, resourceName, restoredName,
      });
    }

    return NextResponse.json({ error: `Provider ${provider} not supported` }, { status: 400 });
  } catch (e: any) {
    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.execute",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
    });
    return NextResponse.json({ error: e.message || "Error executing restoration" }, { status: 500 });
  }
}

/**
 * Extract AMI ID from ARN like: arn:aws:ec2:us-east-1::image/ami-0xxx
 * or from a raw AMI ID like: ami-0xxx
 */
function extractAmiId(backupId: string): string {
  // ARN format: arn:aws:ec2:region::image/ami-xxx
  const arnMatch = backupId.match(/ami-[0-9a-f]+/i);
  if (arnMatch) return arnMatch[0];
  // Direct AMI ID
  if (/^ami-[0-9a-f]+$/i.test(backupId)) return backupId;
  throw new Error(`Cannot extract AMI ID from backup_id: ${backupId}`);
}

async function executeAwsRestore(
  request: NextRequest,
  guard: any,
  startedAt: number,
  params: { accountId: string; accountName: string; region: string; backupId: string; resourceId: string; resourceName: string; restoredName: string },
) {
  const { accountId, accountName, region, backupId, resourceId, resourceName, restoredName } = params;

  const awsAccounts = getAWSAccounts();
  const account = awsAccounts.find((a: any) => a.id === accountId || a.name === accountName);
  if (!account) {
    return NextResponse.json({ error: `AWS account ${accountName} not found` }, { status: 400 });
  }

  try {
    const amiId = extractAmiId(backupId);
    const ec2Client = new EC2Client({
      region: account.region,
      credentials: { accessKeyId: account.accessKeyId, secretAccessKey: account.secretAccessKey },
    });

    // Step 1: Get original instance details to replicate configuration
    let instanceType = "t3.medium";
    let subnetId: string | undefined;
    let securityGroupIds: string[] = [];
    let keyName: string | undefined;
    let associatePublicIp = false;

    try {
      const descResult = await ec2Client.send(new DescribeInstancesCommand({
        InstanceIds: [resourceId],
      }));
      const origInstance = descResult.Reservations?.[0]?.Instances?.[0];
      if (origInstance) {
        instanceType = origInstance.InstanceType || "t3.medium";
        subnetId = origInstance.SubnetId;
        securityGroupIds = origInstance.SecurityGroups?.map((sg) => sg.GroupId!).filter(Boolean) || [];
        keyName = origInstance.KeyName;
        // Detect if original has a public IP — if not, don't assign one
        associatePublicIp = !!origInstance.PublicIpAddress;
      }
    } catch {
      // If we can't describe the original, use defaults (no public IP)
    }

    // Step 2: Launch new instance from the AMI
    const runParams: any = {
      ImageId: amiId,
      InstanceType: instanceType,
      MinCount: 1,
      MaxCount: 1,
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: "Name", Value: restoredName },
            { Key: "restore-test", Value: "true" },
            { Key: "original-server", Value: resourceName },
          ],
        },
      ],
    };

    if (subnetId) runParams.SubnetId = subnetId;
    if (securityGroupIds.length > 0) runParams.SecurityGroupIds = securityGroupIds;
    if (keyName) runParams.KeyName = keyName;

    // If the original had no public IP, explicitly prevent one via NetworkInterface
    // (RunInstances in a public subnet auto-assigns public IP unless we override)
    if (!associatePublicIp && subnetId) {
      runParams.NetworkInterfaces = [{
        DeviceIndex: 0,
        SubnetId: subnetId,
        AssociatePublicIpAddress: false,
        Groups: securityGroupIds,
      }];
      // Remove SubnetId and SecurityGroupIds from top level (must be in NetworkInterface)
      delete runParams.SubnetId;
      delete runParams.SecurityGroupIds;
    }

    const runResult = await ec2Client.send(new RunInstancesCommand(runParams));
    const newInstance = runResult.Instances?.[0];
    const newInstanceId = newInstance?.InstanceId || "";

    if (!newInstanceId) {
      throw new Error("RunInstances did not return an InstanceId");
    }

    // Step 3: Record the job
    const jobRes = await queryAudit(
      `INSERT INTO restore_jobs
        (provider, account_id, account_name, original_resource_id, original_resource_name,
         backup_id, restored_resource_name, restored_resource_id, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      ["AWS", accountId, accountName, resourceId, resourceName, backupId, restoredName, newInstanceId, "IN_PROGRESS", null],
    );

    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.execute.aws",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
      metadata: { amiId, newInstanceId, resourceName, restoredName, instanceType },
    });

    return NextResponse.json({
      success: true,
      jobId: jobRes.rows[0]?.id,
      newInstanceId,
      amiId,
      restoredName,
      message: `Servidor restaurado creado: ${restoredName} (${newInstanceId}) desde AMI ${amiId}`,
    });
  } catch (e: any) {
    await queryAudit(
      `INSERT INTO restore_jobs
        (provider, account_id, account_name, original_resource_id, original_resource_name,
         backup_id, restored_resource_name, restored_resource_id, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      ["AWS", accountId, accountName, resourceId, resourceName, backupId, restoredName, null, "FAILED", (e.message || "Unknown error").slice(0, 1000)],
    );

    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.execute.aws",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
      metadata: { resourceName, restoredName, error: e.message },
    });

    return NextResponse.json({ error: `AWS restore failed: ${e.message}` }, { status: 500 });
  }
}

async function executeHuaweiRestore(
  request: NextRequest,
  guard: any,
  startedAt: number,
  params: { accountId: string; accountName: string; region: string; backupId: string; resourceId: string; resourceName: string; restoredName: string },
) {
  const { accountId, accountName, region, backupId, resourceId, resourceName, restoredName } = params;

  const huaweiAccounts = getHuaweiAccounts();
  const account = huaweiAccounts.find((a) => a.projectId === accountId || a.name === accountName);
  if (!account) {
    return NextResponse.json({ error: `Huawei account ${accountName} not found` }, { status: 400 });
  }

  // Record the job as IN_PROGRESS at the start
  const jobRes = await queryAudit(
    `INSERT INTO restore_jobs
      (provider, account_id, account_name, original_resource_id, original_resource_name,
       backup_id, restored_resource_name, restored_resource_id, status, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    ["HUAWEI CLOUD", accountId, accountName, resourceId, resourceName, backupId, restoredName, null, "IN_PROGRESS", null],
  );
  const jobId = jobRes.rows[0]?.id;

  try {
    const ecsHost = `ecs.${account.region}.myhuaweicloud.com`;
    const imsHost = `ims.${account.region}.myhuaweicloud.com`;

    // ── Step 1: Get original ECS details (flavor, AZ, VPC, subnet, security groups) ──
    const ecsDetailRes = await huaweiRequest({
      method: "GET",
      host: ecsHost,
      uri: `/v1/${account.projectId}/cloudservers/${resourceId}`,
      ak: account.ak,
      sk: account.sk,
      projectId: account.projectId,
    });

    if (ecsDetailRes.status >= 400) {
      throw new Error(`Error obteniendo detalles del ECS original: ${JSON.stringify(ecsDetailRes.data || ecsDetailRes.status)}`);
    }

    const origServer = ecsDetailRes.data?.server || {};
    const flavorRef = origServer.flavor?.id || "";
    const fallbackFlavors = ["s6.large.2", "s3.large.2", "s6.medium.2", "s3.medium.2", "c6.large.2"];
    const az = origServer["OS-EXT-AZ:availability_zone"] || `${account.region}a`;
    const vpcId = origServer.metadata?.vpc_id || "";
    const securityGroupIds = (origServer.security_groups || []).map((sg: any) => sg.id).filter(Boolean);
    const keyName = origServer.key_name || "";

    // Get subnet ID
    let subnetId = origServer.metadata?.subnet_id || "";

    if (!subnetId && vpcId) {
      const vpcHost = `vpc.${account.region}.myhuaweicloud.com`;
      try {
        const subnetsRes = await huaweiRequest({
          method: "GET",
          host: vpcHost,
          uri: `/v1/${account.projectId}/subnets`,
          query: { vpc_id: vpcId, limit: "50" },
          ak: account.ak,
          sk: account.sk,
          projectId: account.projectId,
        });
        const subnets = subnetsRes.data?.subnets || [];
        const serverIp = origServer.addresses?.[vpcId]?.[0]?.addr || "";
        if (serverIp) {
          const matchingSubnet = subnets.find((s: any) => {
            const cidr = s.cidr || "";
            if (!cidr) return false;
            const [net, bits] = cidr.split("/");
            const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
            const ipNum = serverIp.split(".").reduce((acc: number, oct: string) => (acc << 8) + parseInt(oct), 0) >>> 0;
            const netNum = net.split(".").reduce((acc: number, oct: string) => (acc << 8) + parseInt(oct), 0) >>> 0;
            return (ipNum & mask) === (netNum & mask);
          });
          subnetId = matchingSubnet?.id || "";
        }
        if (!subnetId && subnets.length > 0) {
          subnetId = subnets[0].id;
        }
      } catch {}
    }

    if (!subnetId) {
      const portId = origServer.addresses?.[vpcId]?.[0]?.["OS-EXT-IPS:port_id"] || "";
      if (portId) {
        const vpcHost = `vpc.${account.region}.myhuaweicloud.com`;
        try {
          const portRes = await huaweiRequest({
            method: "GET",
            host: vpcHost,
            uri: `/v1/${account.projectId}/ports/${portId}`,
            ak: account.ak,
            sk: account.sk,
            projectId: account.projectId,
          });
          subnetId = portRes.data?.port?.fixed_ips?.[0]?.subnet_id || portRes.data?.port?.network_id || "";
        } catch {}
      }
    }

    if (!subnetId) {
      throw new Error("No se pudo determinar el subnet del servidor original");
    }

    // ── Step 2: Create full-ECS image from CBR backup via IMS API ──
    // POST /v1/cloudimages/wholeimages/action
    // Body: { name, description, backup_id, whole_image_type: "CBR" }
    // Returns: { job_id } — async, must poll job status
    //
    // IMG.0134: "The CSBS backup has been registered as an image" — 
    //   means an image already exists from this backup_id. Find it and reuse it.
    let imageId = "";
    let imsJobId = "";
    let imageReused = false;

    // Use a unique image name with timestamp to avoid name collisions
    const imageTimestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    const imageBaseName = `${restoredName}-img-${imageTimestamp}`;

    console.log(`[restore] Creating IMS image from CBR backup ${backupId}...`);

    const imageCreateRes = await huaweiRequest({
      method: "POST",
      host: imsHost,
      uri: `/v1/cloudimages/wholeimages/action`,
      ak: account.ak,
      sk: account.sk,
      projectId: account.projectId,
      body: {
        name: imageBaseName,
        description: `Imagen para restauracion de ${resourceName} desde backup ${backupId.slice(0, 8)}`,
        backup_id: backupId,
        whole_image_type: "CBR",
      },
    });

    if (imageCreateRes.status >= 400) {
      const errCode = imageCreateRes.data?.error?.code || "";
      
      if (errCode === "IMG.0134") {
        // Backup already registered as image — find the existing image
        console.log(`[restore] IMG.0134: backup already has an image, searching for it...`);
        
        // Strategy 1: Search by backup_id in image detail (whole images from CBR)
        // The IMS image created from a CBR backup stores the backup_id in its metadata
        // Try listing whole images without restrictive filters
        let found = false;
        
        // Search all active whole images
        const listRes = await huaweiRequest({
          method: "GET",
          host: imsHost,
          uri: `/v2/cloudimages`,
          query: { limit: "100", status: "active", image_type: "whole" },
          ak: account.ak,
          sk: account.sk,
          projectId: account.projectId,
        });
        
        let allImages = listRes.data?.images || [];
        console.log(`[restore] IMS whole images found: ${allImages.length}`);
        
        // Also try without image_type filter (some whole images may not be tagged)
        const listAllRes = await huaweiRequest({
          method: "GET",
          host: imsHost,
          uri: `/v2/cloudimages`,
          query: { limit: "100", status: "active" },
          ak: account.ak,
          sk: account.sk,
          projectId: account.projectId,
        });
        const allImagesExtra = (listAllRes.data?.images || []).filter(
          (img: any) => !allImages.some((existing: any) => existing.id === img.id)
        );
        allImages = [...allImages, ...allImagesExtra];
        console.log(`[restore] Total active images after merge: ${allImages.length}`);
        
        // Search priority:
        // 1. Image whose name contains the restored server name
        // 2. Image whose name contains the original server name
        // 3. Image whose name contains the backup_id prefix
        // 4. Any whole image (last resort)
        
        let matchReason = "";
        for (const img of allImages) {
          const name = img.name || "";
          // Check by restored name pattern
          if (name.includes(restoredName) || name.includes(`${restoredName}-img-`) || name === `${restoredName}-image`) {
            imageId = img.id;
            matchReason = `name match: ${name}`;
            break;
          }
          // Check by original name pattern
          if (name.includes(resourceName) && name.includes("restaurad")) {
            imageId = img.id;
            matchReason = `original name match: ${name}`;
            break;
          }
          // Check by backup_id in name/description
          if (name.includes(backupId.slice(0, 8)) || (img.description || "").includes(backupId.slice(0, 8))) {
            imageId = img.id;
            matchReason = `backup_id match: ${name}`;
            break;
          }
        }
        
        if (imageId) {
          imageReused = true;
          console.log(`[restore] Reusing existing image: ${imageId} (${matchReason})`);
        } else {
          // Last resort: check each whole image's detail for backup_id in metadata
          console.log(`[restore] No name match, checking image details for backup_id...`);
          for (const img of allImages.slice(0, 20)) {
            try {
              const detailRes = await huaweiRequest({
                method: "GET",
                host: imsHost,
                uri: `/v2/cloudimages/${img.id}`,
                ak: account.ak,
                sk: account.sk,
                projectId: account.projectId,
              });
              const backupRef = detailRes.data?.backup_id 
                || detailRes.data?.whole_image_backup_id
                || detailRes.data?.metadata?.backup_id
                || "";
              if (backupRef === backupId) {
                imageId = img.id;
                imageReused = true;
                matchReason = `backup_id in detail: ${img.name}`;
                console.log(`[restore] Reusing existing image: ${imageId} (${matchReason})`);
                break;
              }
            } catch {}
          }
        }
        
        if (!imageId) {
          throw new Error(`IMG.0134: backup ya tiene imagen pero no se encontró en IMS. Imágenes activas: ${allImages.length}. Busque manualmente en la consola de Huawei.`);
        }
      } else {
        const errDetail = imageCreateRes.data?.error || imageCreateRes.data || imageCreateRes.status;
        throw new Error(`Error creando imagen desde backup CBR (IMS): ${JSON.stringify(errDetail)}`);
      }
    } else {
      // Image creation initiated — poll job status
      imsJobId = imageCreateRes.data?.job_id || "";
      if (!imsJobId) {
        throw new Error(`IMS no devolvió job_id. Response: ${JSON.stringify(imageCreateRes.data).slice(0, 500)}`);
      }

      console.log(`[restore] IMS image creation job: ${imsJobId}, waiting for completion...`);

      // ── Step 3: Poll IMS job status until image is ready ──
      // GET /v1/jobs/{job_id} — returns { status: "success"/"fail"/"running", entities: { image_id } }
      // Note: Huawei IMS job response may nest status under .job or return it at top level
      const MAX_IMAGE_WAIT = 60; // max ~5 minutes (60 × 5s)
      for (let attempt = 0; attempt < MAX_IMAGE_WAIT; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));

        const jobCheckRes = await huaweiRequest({
          method: "GET",
          host: imsHost,
          uri: `/v1/jobs/${imsJobId}`,
          ak: account.ak,
          sk: account.sk,
          projectId: account.projectId,
        });

        // Huawei job response: status can be at top level or nested under .job
        const jobData = jobCheckRes.data?.job || jobCheckRes.data || {};
        const jobStatus = (jobData.status || "").toUpperCase();
        const jobProgress = jobData.progress || "";

        // Log full response on first attempt to debug response structure
        if (attempt === 0) {
          console.log(`[restore] IMS job first response: ${JSON.stringify(jobCheckRes.data).slice(0, 500)}`);
        }

        if (attempt < 3 || attempt % 10 === 0 || jobStatus) {
          console.log(`[restore] IMS job ${imsJobId} status=${jobStatus} progress=${jobProgress} (attempt ${attempt + 1})`);
        }

        if (jobStatus === "SUCCESS") {
          // Image created successfully — get the image_id from the job response
          imageId = jobData.entities?.image_id
            || jobData.image_id
            || jobData.output?.image_id
            || jobCheckRes.data?.entities?.image_id
            || "";
          if (imageId) break;
          // If no image_id in job response, try to find it by name
          break;
        }

        if (jobStatus === "FAIL" || jobStatus === "FAILED") {
          const failReason = jobData.error || jobData.message || jobCheckRes.data?.error || "Unknown error";
          throw new Error(`IMS image creation job failed: ${JSON.stringify(failReason)}`);
        }

        // Still running or empty status — continue polling
      }

      // If we didn't get imageId from the job, try to find the image by name
      if (!imageId) {
        console.log(`[restore] No image_id from job response, searching by name...`);
        const listImagesRes = await huaweiRequest({
          method: "GET",
          host: imsHost,
          uri: `/v2/cloudimages`,
          query: { name: imageBaseName, limit: "5", status: "active" },
          ak: account.ak,
          sk: account.sk,
          projectId: account.projectId,
        });
        const images = listImagesRes.data?.images || [];
        if (images.length > 0) {
          imageId = images[0].id;
        }
      }
    }

    if (!imageId) {
      throw new Error(`No se pudo obtener el ID de la imagen creada desde el backup. IMS Job: ${imsJobId || "N/A"}`);
    }

    console.log(`[restore] Image ready: ${imageId} (reused=${imageReused})`);

    // ── Step 4: Create new ECS from the image ──
    const ecsBody: any = {
      server: {
        name: restoredName,
        imageRef: imageId,
        flavorRef,
        availability_zone: az,
        vpcid: vpcId,
        nics: [{ subnet_id: subnetId }],
        root_volume: { volumetype: "SAS", size: 40 },
        adminPass: "Restauracion2026!",
        metadata: {
          restored_from: resourceName,
          restore_backup: backupId,
          restore_image: imageId,
        },
      },
    };
    if (securityGroupIds.length > 0) {
      ecsBody.server.security_groups = securityGroupIds.map((id: string) => ({ id }));
    }
    if (keyName) {
      ecsBody.server.key_name = keyName;
    }

    // Try creating ECS — if flavor sold out, try fallback flavors
    let createRes = await huaweiRequest({
      method: "POST",
      host: ecsHost,
      uri: `/v1/${account.projectId}/cloudservers`,
      ak: account.ak,
      sk: account.sk,
      projectId: account.projectId,
      body: ecsBody,
    });

    if (createRes.status >= 400 && flavorRef) {
      const errCode = createRes.data?.error?.code || "";
      if (errCode === "Ecs.0018" || String(createRes.data).includes("sold out")) {
        for (const fbFlavor of fallbackFlavors) {
          ecsBody.server.flavorRef = fbFlavor;
          createRes = await huaweiRequest({
            method: "POST",
            host: ecsHost,
            uri: `/v1/${account.projectId}/cloudservers`,
            ak: account.ak,
            sk: account.sk,
            projectId: account.projectId,
            body: ecsBody,
          });
          if (createRes.status < 400) break;
        }
      }
    }

    if (createRes.status >= 400) {
      throw new Error(`Error creando ECS nuevo: ${JSON.stringify(createRes.data || createRes.status)}`);
    }

    const newEcsId = createRes.data?.server?.id || createRes.data?.id || createRes.data?.serverIds?.[0] || "";
    if (!newEcsId) {
      throw new Error(`No se recibió ID del nuevo ECS. Response: ${JSON.stringify(createRes.data).slice(0, 500)}`);
    }

    console.log(`[restore] ECS created: ${newEcsId}, waiting for ACTIVE...`);

    // ── Step 5: Wait for ECS to be ACTIVE ──
    let ecsRunning = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      const checkRes = await huaweiRequest({
        method: "GET",
        host: ecsHost,
        uri: `/v1/${account.projectId}/cloudservers/${newEcsId}`,
        ak: account.ak,
        sk: account.sk,
        projectId: account.projectId,
      });
      const status = checkRes.data?.server?.status || "";
      if (status === "ACTIVE") {
        ecsRunning = true;
        break;
      }
      if (status === "ERROR") {
        throw new Error("Nuevo ECS creado en estado ERROR");
      }
    }

    // ── Step 6: Delete the temporary image (cleanup) ──
    // The image was only needed to create the ECS. Now that the ECS exists,
    // delete the image to free space and avoid IMG.0134 on future restores.
    if (imageId && !imageReused) {
      try {
        const deleteImgRes = await huaweiRequest({
          method: "DELETE",
          host: imsHost,
          uri: `/v2/cloudimages/${imageId}`,
          ak: account.ak,
          sk: account.sk,
          projectId: account.projectId,
        });
        if (deleteImgRes.status < 400) {
          console.log(`[restore] Temporary image ${imageId} deleted (cleanup)`);
        } else {
          // Image deletion is async — even if it returns an error, it may still be queued
          console.log(`[restore] Image deletion response: ${deleteImgRes.status} (may still be processing)`);
        }
      } catch (delErr: any) {
        // Non-critical — don't fail the restore just because cleanup failed
        console.log(`[restore] Image cleanup failed (non-critical): ${delErr?.message}`);
      }
    }

    // ── Step 7: Update job as COMPLETED ──
    const finalStatus = ecsRunning ? "COMPLETED" : "IN_PROGRESS";
    await queryAudit(
      `UPDATE restore_jobs SET restored_resource_id = $1, status = $2, completed_at = CASE WHEN $2::varchar = 'COMPLETED' THEN now() ELSE completed_at END WHERE id = $3`,
      [newEcsId, finalStatus, jobId],
    );

    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.execute.huawei",
      category: "data",
      result: "success",
      statusCode: 200,
      startedAt,
      metadata: { newEcsId, flavorRef: ecsBody.server.flavorRef, az, vpcId, subnetId, imageId, imsJobId, backupId, resourceName, restoredName, status: finalStatus },
    });

    return NextResponse.json({
      success: true,
      jobId,
      newEcsId,
      imageId,
      restoredName,
      message: ecsRunning
        ? `Servidor restaurado: ${restoredName} (${newEcsId}) — estado ACTIVE`
        : `Servidor restaurado creado: ${restoredName} (${newEcsId}) — esperando estado ACTIVE`,
    });
  } catch (e: any) {
    // Update job as FAILED
    await queryAudit(
      `UPDATE restore_jobs SET status = 'FAILED', error = $1 WHERE id = $2`,
      [(e.message || "Unknown error").slice(0, 1000), jobId],
    );

    await recordApiAudit(request, guard.session, {
      action: "data.restauracion.execute.huawei",
      category: "data",
      result: "error",
      statusCode: 500,
      startedAt,
      metadata: { resourceName, restoredName, error: e.message },
    });

    return NextResponse.json({ error: `Huawei restore failed: ${e.message}` }, { status: 500 });
  }
}
