/**
 * Validación de versiones de bases de datos vía API del proveedor.
 *
 * AWS (equivalente al script de referencia en PowerShell):
 *   aws rds describe-db-engine-versions --engine X --engine-version Y
 *     --query 'DBEngineVersions[0].ValidUpgradeTarget[?IsMajorVersionUpgrade==`false`].EngineVersion'
 *   → la ÚLTIMA entrada es la última versión menor disponible.
 *   RequiereUpgrade = (versión actual != última versión menor).
 *
 * Huawei Cloud (equivalente mejorado):
 *   GET /v3/{project_id}/datastores/{engine}/small-version?version={actual}
 *   → dataStores = versiones menores disponibles para upgrade;
 *     la más alta es la última versión menor disponible.
 */
import {
  RDSClient,
  DescribeDBEngineVersionsCommand,
} from "@aws-sdk/client-rds";

import {
  getAWSAccounts
} from "@/lib/aws/accounts";

import {
  getHuaweiAccounts
} from "@/lib/huawei/accounts";

import {
  huaweiRequest
} from "@/lib/huawei/auth";

// ── Resultado del chequeo ──────────────────────────────────────────────────────

export type VersionCheckResult =
  | {
      kind: "ok";
      /** Última versión menor disponible (== versión actual si está al día). */
      latestPatch: string;
      updateStatus: "Actualizada" | "Patch Disponible";
      observation: string;
    }
  | {
      /** El proveedor no soporta consultar versiones para este motor. */
      kind: "unsupported";
      observation: string;
    }
  | {
      /** Error transitorio de API: se preservan los valores previos. */
      kind: "error";
      message: string;
    };

// Motores de caché: ElastiCache no soporta upgrades menores in-situ
// (la API de RDS no los conoce).
const CACHE_ENGINES = new Set(["valkey", "redis", "memcached"]);

// ── Utilidades ────────────────────────────────────────────────────────────────

/**
 * Compara dos cadenas de versión de forma numérica parte por parte.
 * Devuelve >0 si a > b, <0 si a < b, 0 si son equivalentes.
 * "8.0.45.260900" vs "8.0.43.260600" → >0
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/** Nota sobre upgrades mayores disponibles (solo informativa). */
function majorUpgradeNote(majors: string[]): string {
  if (majors.length === 0) return "";
  const shown = majors.slice(0, 3).join(", ");
  const extra = majors.length > 3 ? ` (+${majors.length - 3} más)` : "";
  return ` Upgrade mayor disponible: ${shown}${extra}. Requiere validación funcional.`;
}

// ── AWS ───────────────────────────────────────────────────────────────────────

/**
 * Valida la versión de una BD de AWS contra describe-db-engine-versions.
 *
 * Toma ValidUpgradeTarget con IsMajorVersionUpgrade == false, y la ÚLTIMA
 * entrada es la última versión menor a la que se puede subir (igual que el
 * script de referencia). Si la lista está vacía o la última entrada es igual
 * a la versión actual, la BD está actualizada.
 */
export async function checkAWSVersion(engine: string, engineVersion: string): Promise<VersionCheckResult> {
  const normEngine = (engine || "").toLowerCase();

  if (CACHE_ENGINES.has(normEngine)) {
    return {
      kind: "unsupported",
      observation: "Motor de caché (ElastiCache): no aplica validación de parches menores vía API RDS.",
    };
  }

  const accounts = getAWSAccounts();
  if (accounts.length === 0) {
    return { kind: "error", message: "Sin cuentas AWS configuradas" };
  }

  // describe-db-engine-versions es un catálogo global del motor: cualquier
  // cuenta con permisos de lectura de RDS sirve.
  const account = accounts[0];
  const client = new RDSClient({
    region: account.region,
    credentials: {
      accessKeyId: account.accessKeyId,
      secretAccessKey: account.secretAccessKey,
    },
  });

  try {
    const data = await client.send(
      new DescribeDBEngineVersionsCommand({
        Engine: engine,
        EngineVersion: engineVersion,
      }),
    );

    const targets = data.DBEngineVersions?.[0]?.ValidUpgradeTarget || [];
    const minor = targets
      .filter((t) => t.IsMajorVersionUpgrade === false)
      .map((t) => t.EngineVersion || "")
      .filter(Boolean);
    const major = targets
      .filter((t) => t.IsMajorVersionUpgrade === true)
      .map((t) => t.EngineVersion || "")
      .filter(Boolean);

    // Última entrada de los upgrades menores = última versión menor disponible.
    const latest = minor.length > 0 ? minor[minor.length - 1] : null;
    const note = majorUpgradeNote(major);

    if (latest && latest !== engineVersion) {
      return {
        kind: "ok",
        latestPatch: latest,
        updateStatus: "Patch Disponible",
        observation: `Patch disponible: ${latest}. Se recomienda aplicar parche menor para seguridad y estabilidad.${note}`,
      };
    }

    // Sin upgrades menores, o la versión actual ya ES la última menor.
    return {
      kind: "ok",
      latestPatch: engineVersion,
      updateStatus: "Actualizada",
      observation: latest ? "" : `No hay parches menores disponibles para esta versión.${note}`,
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    if (/unrecognized engine/i.test(message)) {
      return {
        kind: "unsupported",
        observation: `Motor ${engine} no soportado por la API de versiones de AWS RDS.`,
      };
    }
    return { kind: "error", message };
  }
}

// ── Huawei Cloud ──────────────────────────────────────────────────────────────

/**
 * Valida la versión de una BD de Huawei contra la API small-version de RDS.
 *
 * GET /v3/{project_id}/datastores/{engine}/small-version?version={actual}
 * devuelve las versiones menores disponibles para upgrade; la más alta es
 * la última versión menor disponible (equivalente al último upgrade target
 * no-mayor de AWS).
 *
 * El catálogo de versiones es REGIONAL (no por proyecto): si la cuenta
 * dueña de la instancia falla por permisos IAM (403), se reintenta con
 * otra cuenta configurada de la misma región.
 */
export async function checkHuaweiVersion(accountId: string, engine: string, engineVersion: string): Promise<VersionCheckResult> {
  const normEngine = (engine || "").toLowerCase();

  if (CACHE_ENGINES.has(normEngine)) {
    return {
      kind: "unsupported",
      observation: "Motor de caché: no aplica validación de parches menores vía API RDS.",
    };
  }

  // La API small-version solo soporta mysql y postgresql.
  if (normEngine !== "mysql" && normEngine !== "postgresql") {
    return {
      kind: "unsupported",
      observation: `Motor ${engine} no soportado por la API de versiones de Huawei RDS.`,
    };
  }

  const accounts = getHuaweiAccounts();
  if (accounts.length === 0) {
    return { kind: "error", message: "Sin cuentas Huawei configuradas" };
  }

  // Candidatos: primero la cuenta dueña de las instancias, luego otras
  // cuentas de la misma región (el catálogo small-version es regional).
  const owner = accounts.find((a) => a.projectId === accountId);
  const candidates = [
    ...(owner ? [owner] : []),
    ...accounts.filter((a) => a !== owner && (!owner || a.region === owner.region)),
    ...accounts.filter((a) => a !== owner && owner && a.region !== owner.region),
  ];

  let lastError = "Sin respuesta de la API de versiones de Huawei RDS";
  for (const account of candidates) {
    const result = await queryHuaweiSmallVersion(account, normEngine, engine, engineVersion);
    if (result.kind === "error") {
      lastError = result.message;
      continue; // probar con la siguiente cuenta (p. ej. permisos IAM)
    }
    return result; // ok o unsupported (determinístico por motor)
  }
  return { kind: "error", message: lastError };
}

/** Llama a la API small-version con una cuenta específica. */
async function queryHuaweiSmallVersion(
  account: { projectId: string; ak: string; sk: string; region: string },
  normEngine: string,
  engine: string,
  engineVersion: string,
): Promise<VersionCheckResult> {
  try {
    const response = await huaweiRequest({
      method: "GET",
      host: `rds.${account.region}.myhuaweicloud.com`,
      uri: `/v3/${account.projectId}/datastores/${normEngine}/small-version`,
      ak: account.ak,
      sk: account.sk,
      projectId: account.projectId,
      query: { version: engineVersion },
    });

    if (!response || response.status >= 400) {
      const errorCode = response?.data?.error_code || "";
      const errorMsg = response?.data?.error_msg || `HTTP ${response?.status ?? "sin respuesta"}`;
      // 400 = motor/versión no soportada por la API (determinístico).
      if (response?.status === 400 || /unsupported/i.test(String(errorMsg))) {
        return {
          kind: "unsupported",
          observation: `Motor ${engine} no soportado por la API de versiones de Huawei RDS.`,
        };
      }
      return { kind: "error", message: `${errorCode ? errorCode + ": " : ""}${errorMsg}` };
    }

    const list = response?.data?.dataStores || response?.data?.data_stores || [];
    const versions = list.map((v: any) => v?.name).filter(Boolean) as string[];

    // Sin versiones disponibles para upgrade → ya está en la última menor.
    if (versions.length === 0) {
      return {
        kind: "ok",
        latestPatch: engineVersion,
        updateStatus: "Actualizada",
        observation: "No hay versiones menores disponibles para upgrade.",
      };
    }

    // La más alta de las disponibles = última versión menor.
    const latest = versions.reduce((max, v) => (compareVersions(v, max) > 0 ? v : max), versions[0]);

    if (latest !== engineVersion && compareVersions(latest, engineVersion) > 0) {
      return {
        kind: "ok",
        latestPatch: latest,
        updateStatus: "Patch Disponible",
        observation: `Patch disponible: ${latest}. Se recomienda aplicar parche menor para seguridad y estabilidad.`,
      };
    }

    return {
      kind: "ok",
      latestPatch: engineVersion,
      updateStatus: "Actualizada",
      observation: "",
    };
  } catch (err: any) {
    return { kind: "error", message: err?.message || String(err) };
  }
}
