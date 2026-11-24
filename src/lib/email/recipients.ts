import { queryAudit } from "@/lib/db/pool";
import { resolveSecret } from "@/lib/secrets/crypto";

export type InformeRecipient = {
  id: string;
  email: string;
  name: string | null;
  active: boolean;
  reportType: string | null; // null = all types, "servers"|"rds"|"logs"|"vaults" = specific
  createdBy: string | null;
  createdAt: string;
};

export type RecipientsSource = "db" | "env" | "none";

export type ReportType = "servers" | "rds" | "logs" | "vaults";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim().toLowerCase());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toRecipient(row: any): InformeRecipient {
  return {
    id: row.id,
    email: row.email,
    name: row.name || null,
    active: !!row.active,
    reportType: row.report_type || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

export async function listRecipients(reportType?: ReportType | null): Promise<InformeRecipient[]> {
  if (reportType) {
    // List recipients for a specific report type:
    // those with report_type = the specific type + those with report_type = NULL (applies to all)
    const res = await queryAudit(
      `SELECT id, email, name, active, report_type, created_by, created_at
       FROM informe_recipients
       WHERE report_type = $1 OR report_type IS NULL
       ORDER BY active DESC, report_type NULLS FIRST, email ASC`,
      [reportType],
    );
    return res.rows.map(toRecipient);
  }
  // List all recipients (no filter)
  const res = await queryAudit(
    `SELECT id, email, name, active, report_type, created_by, created_at FROM informe_recipients ORDER BY active DESC, report_type NULLS FIRST, email ASC`,
  );
  return res.rows.map(toRecipient);
}

export async function addRecipient(email: string, name?: string, createdBy?: string, reportType?: ReportType | null): Promise<InformeRecipient> {
  const clean = normalizeEmail(email);
  if (!isValidEmail(clean)) throw new Error("INVALID_EMAIL");
  const rt = reportType || null; // null = applies to all types
  const res = await queryAudit(
    `INSERT INTO informe_recipients (email, name, active, created_by, report_type)
     VALUES ($1, $2, true, $3, $4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, active = true, created_by = EXCLUDED.created_by, report_type = EXCLUDED.report_type
     RETURNING id, email, name, active, report_type, created_by, created_at`,
    [clean, (name || "").trim().slice(0, 200) || null, (createdBy || "").slice(0, 320) || null, rt],
  );
  return toRecipient(res.rows[0]);
}

export async function removeRecipient(id: string): Promise<boolean> {
  const res = await queryAudit(`DELETE FROM informe_recipients WHERE id = $1`, [id]);
  return (res.rowCount || 0) > 0;
}

export async function setRecipientActive(id: string, active: boolean): Promise<InformeRecipient | null> {
  const res = await queryAudit(
    `UPDATE informe_recipients SET active = $2 WHERE id = $1
     RETURNING id, email, name, active, report_type, created_by, created_at`,
    [id, active],
  );
  return res.rows[0] ? toRecipient(res.rows[0]) : null;
}

function envRecipients(): string[] {
  try {
    const raw = resolveSecret(process.env.SENDGRID_RECIPIENTS, { label: "SENDGRID_RECIPIENTS" });
    if (!raw) return [];
    return raw.split(",").map((r) => normalizeEmail(r)).filter((r) => isValidEmail(r));
  } catch {
    return [];
  }
}

/**
 * Destinatarios efectivos para un tipo de informe específico:
 * 1. BD recipients where report_type = the specific type OR report_type IS NULL (all types)
 * 2. Si no hay ninguno en BD, se usa SENDGRID_RECIPIENTS como respaldo.
 */
export async function getEffectiveRecipients(reportType?: ReportType): Promise<{ emails: string[]; source: RecipientsSource }> {
  try {
    const all = await listRecipients(reportType || null);
    const active = all.filter((r) => r.active).map((r) => r.email);
    if (active.length > 0) return { emails: active, source: "db" };
  } catch {
    // BD no disponible: se intenta el respaldo de entorno
  }
  const env = envRecipients();
  return { emails: env, source: env.length > 0 ? "env" : "none" };
}
