import axios from "axios";

import crypto from "crypto";

import https from "https";

export async function getHuaweiECSInventory() {

  try {

    const method = "GET";

    const host =
      "ecs.la-north-2.myhuaweicloud.com";

    const uri =
      `/v1/${process.env.HUAWEI_PROJECT_ID}/cloudservers/detail/`;

    const endpoint =
      `https://${host}/v1/${process.env.HUAWEI_PROJECT_ID}/cloudservers/detail`;

    const now = new Date();

    const timestamp = now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, "");

    const signedHeaders =
      "content-type;host;x-project-id;x-sdk-content-sha256;x-sdk-date";

    const canonicalRequest =
`${method}
${uri}

content-type:application/json;charset=UTF-8
host:${host}
x-project-id:${process.env.HUAWEI_PROJECT_ID}
x-sdk-content-sha256:UNSIGNED-PAYLOAD
x-sdk-date:${timestamp}

${signedHeaders}
UNSIGNED-PAYLOAD`;

    const hashedCanonicalRequest =
      crypto
        .createHash("sha256")
        .update(canonicalRequest)
        .digest("hex");

    const stringToSign =
`SDK-HMAC-SHA256
${timestamp}
${hashedCanonicalRequest}`;

    const signature =
      crypto
        .createHmac(
          "sha256",
          process.env.HUAWEI_SK!
        )
        .update(stringToSign)
        .digest("hex");

    const authorization =
`SDK-HMAC-SHA256 Access=${process.env.HUAWEI_AK}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers = {

      "Content-Type":
        "application/json;charset=UTF-8",

      "Host":
        host,

      "X-Project-Id":
        process.env.HUAWEI_PROJECT_ID!,

      "X-Sdk-Date":
        timestamp,

      "X-Sdk-Content-Sha256":
        "UNSIGNED-PAYLOAD",

      "Authorization":
        authorization

    };

    console.log(
      "HUAWEI HEADERS:",
      headers
    );

    const httpsAgent =
      new https.Agent({

        rejectUnauthorized: false

      });

    const response = await axios({

      method: "GET",

      url: endpoint,

      headers,

      httpsAgent,

      validateStatus: () => true

    });

    console.log(
      "HUAWEI STATUS:",
      response.status
    );

    console.log(
      "HUAWEI RESPONSE:",
      JSON.stringify(
        response.data,
        null,
        2
      )
    );

    const servers =
      response.data.servers || [];

    console.log(
      "HUAWEI SERVERS COUNT:",
      servers.length
    );

    return servers.map((server: any) => {

      let hostIp = "N/A";

      if (server.addresses) {

        const networks =
          Object.values(
            server.addresses
          ) as any[];

        if (
          networks.length > 0 &&
          networks[0].length > 0
        ) {

          hostIp =
            networks[0][0]?.addr || "N/A";

        }

      }

      return {
        provider:
          "HUAWEI CLOUD",
        accountName:
          "acc_qa",

        accountId:
          server.tenant_id || "N/A",

        service:
          "ECS",

        name:
          server.name || "N/A",

        id:
          server.id || "N/A",

        host:
          hostIp,

        status:
          server.status || "UNKNOWN",

        operatingSystem:
          "Linux"

      };

    });

  } catch (error: any) {

    console.error(
      "HUAWEI FINAL ERROR:",
      error?.response?.data || error
    );

    return [];

  }

}