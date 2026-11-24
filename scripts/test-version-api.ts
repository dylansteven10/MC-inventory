/**
 * Prueba end-to-end de la validación de versiones vía API.
 * Ejecuta checkAWSVersion/checkHuaweiVersion contra los combos reales
 * presentes en database_inventory y muestra el resultado que se persistiría.
 */
import "dotenv/config";
import { checkAWSVersion, checkHuaweiVersion } from "@/lib/db/version-api";

// Combos reales de database_inventory (consulta 2026-11-20)
const AWS_COMBOS = [
  { engine: "aurora-mysql", version: "8.0.mysql_aurora.3.12.0" },
  { engine: "aurora-postgresql", version: "17.7" },
  { engine: "docdb", version: "5.0.0" },
  { engine: "docdb", version: "4.0.0" },
  { engine: "mysql", version: "8.0.46-rds.20260624" },
  { engine: "mysql", version: "8.4.9" },
  { engine: "oracle-ee", version: "19.0.0.0.ru-2025-10.rur-2025-10.r1" },
  { engine: "oracle-ee", version: "19.0.0.0.ru-2026-07.mrp-2026-09.r2" },
  { engine: "oracle-se2", version: "19.0.0.0.ru-2026-07.mrp-2026-09.r2" },
  { engine: "postgres", version: "14.22" },
  { engine: "postgres", version: "16.13" },
  { engine: "postgres", version: "18.3" },
  { engine: "sqlserver-se", version: "16.00.4225.2.v1" },
  { engine: "valkey", version: "8.1.0" },
];

const HUAWEI_COMBOS = [
  { accountId: "38874a92e7d44454951c174401002fb4", engine: "MySQL", version: "8.0.43.260600" },
  { accountId: "207f90ef68764b159b026cd2b7837778", engine: "MySQL", version: "8.0.43.251200" },
  { accountId: "38874a92e7d44454951c174401002fb4", engine: "MySQL", version: "5.7.44.241207" },
  { accountId: "38874a92e7d44454951c174401002fb4", engine: "SQLServer", version: "2014_EE" },
];

async function main() {
  console.log(`AWS: ${AWS_COMBOS.length} combos, HUAWEI: ${HUAWEI_COMBOS.length} combos\n`);
  let ok = 0, unsupported = 0, errors = 0;

  for (const c of AWS_COMBOS) {
    const r = await checkAWSVersion(c.engine, c.version);
    if (r.kind === "ok") {
      ok++;
      console.log(`✓ AWS ${c.engine} ${c.version} → latestPatch: ${r.latestPatch} | ${r.updateStatus}`);
      if (r.observation) console.log(`    obs: ${r.observation.slice(0, 130)}`);
    } else if (r.kind === "unsupported") {
      unsupported++;
      console.log(`- AWS ${c.engine} ${c.version} → NO SOPORTADO: ${r.observation.slice(0, 100)}`);
    } else {
      errors++;
      console.log(`✗ AWS ${c.engine} ${c.version} → ERROR: ${r.message.slice(0, 130)}`);
    }
  }

  for (const c of HUAWEI_COMBOS) {
    const r = await checkHuaweiVersion(c.accountId, c.engine, c.version);
    if (r.kind === "ok") {
      ok++;
      console.log(`✓ HUAWEI ${c.engine} ${c.version} → latestPatch: ${r.latestPatch} | ${r.updateStatus}`);
      if (r.observation) console.log(`    obs: ${r.observation.slice(0, 130)}`);
    } else if (r.kind === "unsupported") {
      unsupported++;
      console.log(`- HUAWEI ${c.engine} ${c.version} → NO SOPORTADO: ${r.observation.slice(0, 100)}`);
    } else {
      errors++;
      console.log(`✗ HUAWEI ${c.engine} ${c.version} → ERROR: ${r.message.slice(0, 130)}`);
    }
  }

  console.log(`\nResumen: ${ok} ok, ${unsupported} no soportados, ${errors} errores`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
