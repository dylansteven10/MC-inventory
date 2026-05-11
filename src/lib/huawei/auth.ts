import axios from "axios";
import crypto from "crypto";
import https from "https";

type HuaweiRequestParams = {
  method: string;
  host: string;
  uri: string;
};

export async function huaweiRequest({
  method,
  host,
  uri
}: HuaweiRequestParams) {

  try {

    // ─────────────────────────────────────
    // Limpiar URI
    // ─────────────────────────────────────

    const cleanUri =
      uri.endsWith("/")
        ? uri.slice(0, -1)
        : uri;

    // Huawei firma SIEMPRE con slash final
    const canonicalUri =
      cleanUri + "/";

    const endpoint =
      `https://${host}${cleanUri}`;

    // ─────────────────────────────────────
    // Fecha Huawei
    // ─────────────────────────────────────

    const timestamp =
      new Date()
        .toISOString()
        .replace(/[:-]|\.\d{3}/g, "");

    // ─────────────────────────────────────
    // Variables Huawei
    // ─────────────────────────────────────

    const HUAWEI_AK =
      process.env.HUAWEI_ACCOUNT_1_AK!;

    const HUAWEI_SK =
      process.env.HUAWEI_ACCOUNT_1_SK!;

    const HUAWEI_PROJECT_ID =
      process.env.HUAWEI_ACCOUNT_1_PROJECT_ID!;

    if (
      !HUAWEI_AK ||
      !HUAWEI_SK ||
      !HUAWEI_PROJECT_ID
    ) {

      console.error(
        "Faltan variables Huawei Cloud en .env.local"
      );

      return null;

    }

    // ─────────────────────────────────────
    // Headers firmados
    // ─────────────────────────────────────

    const signedHeaders =
      "content-type;host;x-project-id;x-sdk-content-sha256;x-sdk-date";

    // ─────────────────────────────────────
    // Canonical Request
    // ─────────────────────────────────────

    const canonicalRequest =
`${method}
${canonicalUri}

content-type:application/json;charset=UTF-8
host:${host}
x-project-id:${HUAWEI_PROJECT_ID}
x-sdk-content-sha256:UNSIGNED-PAYLOAD
x-sdk-date:${timestamp}

${signedHeaders}
UNSIGNED-PAYLOAD`;

    console.log(
      "CANONICAL REQUEST:\n",
      canonicalRequest
    );

    // ─────────────────────────────────────
    // Hash canonical request
    // ─────────────────────────────────────

    const hashedCanonicalRequest =
      crypto
        .createHash("sha256")
        .update(canonicalRequest)
        .digest("hex");

    // ─────────────────────────────────────
    // String to sign
    // ─────────────────────────────────────

    const stringToSign =
`SDK-HMAC-SHA256
${timestamp}
${hashedCanonicalRequest}`;

    // ─────────────────────────────────────
    // Firma
    // ─────────────────────────────────────

    const signature =
      crypto
        .createHmac(
          "sha256",
          HUAWEI_SK
        )
        .update(stringToSign)
        .digest("hex");

    // ─────────────────────────────────────
    // Authorization header
    // ─────────────────────────────────────

    const authorization =
`SDK-HMAC-SHA256 Access=${HUAWEI_AK}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // ─────────────────────────────────────
    // Headers finales
    // ─────────────────────────────────────

    const headers = {

      "Content-Type":
        "application/json;charset=UTF-8",

      "Host":
        host,

      "X-Project-Id":
        HUAWEI_PROJECT_ID,

      "X-Sdk-Date":
        timestamp,

      "X-Sdk-Content-Sha256":
        "UNSIGNED-PAYLOAD",

      "Authorization":
        authorization

    };

    console.log(
      "HUAWEI REQUEST:",
      endpoint
    );

    // ─────────────────────────────────────
    // HTTPS Agent
    // ─────────────────────────────────────

    const httpsAgent =
      new https.Agent({

        rejectUnauthorized: false

      });

    // ─────────────────────────────────────
    // Request
    // ─────────────────────────────────────

    const response = await axios({

      method,

      url: endpoint,

      headers,

      httpsAgent,

      validateStatus: () => true

    });

    console.log(
      "HUAWEI STATUS:",
      response.status
    );

    // ─────────────────────────────────────
    // Error Huawei
    // ─────────────────────────────────────

    if (
      response.status >= 400
    ) {

      console.error(
        "HUAWEI API ERROR:",
        JSON.stringify(
          response.data,
          null,
          2
        )
      );

      return null;

    }

    return response.data;

  } catch (error: any) {

    console.error(
      "HUAWEI REQUEST ERROR:",
      error?.response?.data || error
    );

    return null;

  }

}