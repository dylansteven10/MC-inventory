import { queryAudit } from "@/lib/db/pool";

export type BackupException = {
  id: string;
  pattern: string;
  reason: string;
  createdBy: string | null;
  createdAt: string;
};

function toException(row: any): BackupException {
  return {
    id: row.id,
    pattern: row.pattern,
    reason: row.reason || "",
    createdBy: row.created_by || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

/** List all exceptions */
export async function listExceptions(): Promise<BackupException[]> {
  const res = await queryAudit(
    `SELECT id, pattern, reason, created_by, created_at FROM backup_exceptions ORDER BY pattern ASC`,
  );
  return res.rows.map(toException);
}

/** Add an exception pattern */
export async function addException(pattern: string, reason?: string, createdBy?: string): Promise<BackupException> {
  const clean = pattern.trim().slice(0, 255);
  if (!clean) throw new Error("EMPTY_PATTERN");
  const res = await queryAudit(
    `INSERT INTO backup_exceptions (pattern, reason, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (pattern) DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by
     RETURNING id, pattern, reason, created_by, created_at`,
    [clean, (reason || "").trim().slice(0, 255) || "", (createdBy || "").slice(0, 320) || null],
  );
  return toException(res.rows[0]);
}

/** Remove an exception */
export async function removeException(id: string): Promise<boolean> {
  const res = await queryAudit(`DELETE FROM backup_exceptions WHERE id = $1`, [id]);
  return (res.rowCount || 0) > 0;
}

/**
 * Get all exception patterns as a Set for fast matching.
 * Patterns are matched as case-insensitive substrings of the server name.
 */
export async function getExceptionPatterns(): Promise<Set<string>> {
  const res = await queryAudit(`SELECT pattern FROM backup_exceptions`);
  return new Set(res.rows.map((r: any) => r.pattern.toLowerCase()));
}

/**
 * Check if a server name matches any exception pattern.
 * Matching: case-insensitive, pattern is checked as a prefix or substring.
 */
export async function isServerExcluded(serverName: string): Promise<boolean> {
  const patterns = await getExceptionPatterns();
  const name = serverName.toLowerCase();
  for (const pat of patterns) {
    // Match if the pattern appears anywhere in the name, or the name starts with the pattern
    if (name.includes(pat) || name.startsWith(pat)) return true;
  }
  return false;
}

/**
 * Filter a list of server names, removing those that match exceptions.
 * Returns both the filtered list and the excluded names.
 */
export async function filterExcludedServers<T>(
  items: T[],
  getName: (item: T) => string,
): Promise<{ included: T[]; excluded: T[]; excludedNames: string[] }> {
  const patterns = await getExceptionPatterns();
  const included: T[] = [];
  const excluded: T[] = [];
  const excludedNames: string[] = [];

  for (const item of items) {
    const name = getName(item).toLowerCase();
    let isExcluded = false;
    for (const pat of patterns) {
      if (name.includes(pat) || name.startsWith(pat)) {
        isExcluded = true;
        break;
      }
    }
    if (isExcluded) {
      excluded.push(item);
      excludedNames.push(getName(item));
    } else {
      included.push(item);
    }
  }
  return { included, excluded, excludedNames };
}
