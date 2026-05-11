export type HuaweiAccount = {

  name: string;

  projectId: string;

  ak: string;

  sk: string;

};

// ─────────────────────────────────────────────
// Lista completa de cuentas Huawei
// ─────────────────────────────────────────────

export const HUAWEI_ACCOUNTS: HuaweiAccount[] = [

  {
    name:
      process.env.HUAWEI_ACCOUNT_1_NAME!,

    projectId:
      process.env.HUAWEI_ACCOUNT_1_PROJECT_ID!,

    ak:
      process.env.HUAWEI_ACCOUNT_1_AK!,

    sk:
      process.env.HUAWEI_ACCOUNT_1_SK!,
  },

  // ─────────────────────────────────────
  // Futuras cuentas
  // ─────────────────────────────────────
  //
  // {
  //   name:
  //     process.env.HUAWEI_ACCOUNT_2_NAME!,
  //
  //   projectId:
  //     process.env.HUAWEI_ACCOUNT_2_PROJECT_ID!,
  //
  //   ak:
  //     process.env.HUAWEI_ACCOUNT_2_AK!,
  //
  //   sk:
  //     process.env.HUAWEI_ACCOUNT_2_SK!,
  // },

];

// ─────────────────────────────────────────────
// Helper:
// Convierte projectId → nombre de cuenta
// ─────────────────────────────────────────────

export const HUAWEI_ACCOUNT_MAP: Record<string, string> =

  HUAWEI_ACCOUNTS.reduce(

    (acc, account) => {

      acc[account.projectId] =
        account.name;

      return acc;

    },

    {} as Record<string, string>

  );