import { queryAudit } from "@/lib/db/pool";

export type DbBackupException = {
  id: string;
  pattern: string;
  reason: string;
  weekendExempt: boolean;
  accountId: string | null;
  accountName: string | null;
  createdBy: string | null;
  createdAt: string;
};

function toException(row: any): DbBackupException {
  return {
    id: row.id,
    pattern: row.pattern,
    reason: row.reason || "",
    weekendExempt: !!row.weekend_exempt,
    accountId: row.account_id || null,
    accountName: row.account_name || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

const EXCEPTION_COLS = `id, pattern, reason, weekend_exempt, account_id, account_name, created_by, created_at`;

/** List all database exceptions */
export async function listDbExceptions(): Promise<DbBackupException[]> {
  const res = await queryAudit(
    `SELECT ${EXCEPTION_COLS} FROM db_backup_exceptions ORDER BY pattern ASC, account_id ASC`,
  );
  return res.rows.map(toException);
}

/** Add a database exception pattern, optionally scoped to a specific account */
export async function addDbException(
  pattern: string,
  reason?: string,
  createdBy?: string,
  weekendExempt?: boolean,
  accountId?: string | null,
  accountName?: string | null,
): Promise<DbBackupException> {
  const clean = pattern.trim().slice(0, 255);
  if (!clean) throw new Error("EMPTY_PATTERN");
  const res = await queryAudit(
    `INSERT INTO db_backup_exceptions (pattern, reason, created_by, weekend_exempt, account_id, account_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (pattern, account_id) DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, weekend_exempt = EXCLUDED.weekend_exempt, account_name = EXCLUDED.account_name
     RETURNING ${EXCEPTION_COLS}`,
    [clean, (reason || "").trim().slice(0, 255) || "", (createdBy || "").slice(0, 320) || null, !!weekendExempt, accountId || null, accountName || null],
  );
  return toException(res.rows[0]);
}

/** Remove a database exception */
export async function removeDbException(id: string): Promise<boolean> {
  const res = await queryAudit(`DELETE FROM db_backup_exceptions WHERE id = $1`, [id]);
  return (res.rowCount || 0) > 0;
}

/**
 * Get all database exception patterns as a Set for fast matching.
 * Patterns are matched as case-insensitive substrings of the database name.
 */
export async function getDbExceptionPatterns(): Promise<Set<string>> {
  const res = await queryAudit(`SELECT pattern FROM db_backup_exceptions`);
  return new Set(res.rows.map((r: any) => r.pattern.toLowerCase()));
}

/**
 * Get all database exceptions with their reasons, weekend_exempt flag, and account info.
 * account_id = NULL means the exception applies to ALL accounts.
 */
async function getDbExceptionList(): Promise<Array<{ pattern: string; reason: string; weekendExempt: boolean; accountId: string | null; accountName: string | null }>> {
  const res = await queryAudit(
    `SELECT pattern, reason, weekend_exempt, account_id, account_name FROM db_backup_exceptions ORDER BY pattern ASC`,
  );
  return res.rows.map((r: any) => ({
    pattern: r.pattern.toLowerCase(),
    reason: r.reason || "",
    weekendExempt: !!r.weekend_exempt,
    accountId: r.account_id || null,
    accountName: r.account_name || null,
  }));
}

/**
 * Get weekend-exempt database patterns (DBs that don't need backup on Sat/Sun).
 */
export async function getWeekendExemptPatterns(): Promise<Set<string>> {
  const res = await queryAudit(
    `SELECT pattern FROM db_backup_exceptions WHERE weekend_exempt = true`,
  );
  return new Set(res.rows.map((r: any) => r.pattern.toLowerCase()));
}

/**
 * Check if a database name matches any exception pattern.
 * Matching: case-insensitive, pattern is checked as a prefix or substring.
 */
export async function isDbExcluded(dbName: string): Promise<boolean> {
  const patterns = await getDbExceptionPatterns();
  const name = dbName.toLowerCase();
  for (const pat of patterns) {
    if (name.includes(pat) || name.startsWith(pat)) return true;
  }
  return false;
}

/**
 * Check if a database is weekend-exempt (no backup required on Sat/Sun).
 */
export async function isDbWeekendExempt(dbName: string): Promise<boolean> {
  const patterns = await getWeekendExemptPatterns();
  const name = dbName.toLowerCase();
  for (const pat of patterns) {
    if (name.includes(pat) || name.startsWith(pat)) return true;
  }
  return false;
}

/**
 * Check if a name matches a pattern (case-insensitive prefix or substring).
 */
function nameMatchesPattern(name: string, pattern: string): boolean {
  return name.includes(pattern) || name.startsWith(pattern);
}

/**
 * Filter a list of database names, removing those that match exceptions.
 * Returns both the filtered list and the excluded names.
 * If `isWeekend` is true, weekend-exempt DBs are also excluded from "missing" counts.
 * Optionally accepts getAccountName/getAccountId to include account info and enable
 * account-scoped exception matching.
 *
 * Account matching rules:
 * - If an exception has account_id = NULL, it applies to ALL accounts (global).
 * - If an exception has a specific account_id, it only applies to DBs in that account.
 * - A global exception (account_id = NULL) is overridden by a more specific one
 *   (account_id = specific) for that account.
 */
export async function filterExcludedDatabases<T>(
  items: T[],
  getName: (item: T) => string,
  isWeekend?: boolean,
  getAccountName?: (item: T) => string,
  getAccountId?: (item: T) => string,
): Promise<{
  included: T[];
  excluded: T[];
  excludedNames: string[];
  excludedReasons: Map<string, string>;
  weekendExemptNames: string[];
  excludedWeekendItems: Array<{ name: string; account: string; reason: string }>;
  excludedPermanentItems: Array<{ name: string; account: string; reason: string }>;
}> {
  const allExceptions = await getDbExceptionList();
  const weekendPatterns = await getWeekendExemptPatterns();
  const included: T[] = [];
  const excluded: T[] = [];
  const excludedNames: string[] = [];
  const excludedReasons = new Map<string, string>();
  const weekendExemptNames: string[] = [];
  const excludedWeekendItems: Array<{ name: string; account: string; reason: string }> = [];
  const excludedPermanentItems: Array<{ name: string; account: string; reason: string }> = [];

  for (const item of items) {
    const name = getName(item).toLowerCase();
    const displayName = getName(item);
    const accountName = getAccountName ? getAccountName(item) : "No identificada";
    const accountId = getAccountId ? getAccountId(item) : "";
    let isExcluded = false;
    let excludeReason = "";
    let excludedAsWeekend = false;

    for (const exc of allExceptions) {
      const pat = exc.pattern.toLowerCase();
      if (!nameMatchesPattern(name, pat)) continue;

      // Check account scope:
      // - exc.accountId = null → applies to ALL accounts (global exception)
      // - exc.accountId = specific → only applies to DBs in that account
      if (exc.accountId && accountId && exc.accountId !== accountId) {
        // This exception is for a different account — skip it
        continue;
      }

      // Weekend-exempt DBs: only exclude on weekends, include on weekdays
      if (exc.weekendExempt && !isWeekend) {
        // On weekdays, weekend-exempt DBs are NOT excluded
        // They stay in the plan and are counted normally
        continue;
      }

      isExcluded = true;
      excludeReason = exc.reason || "";
      excludedAsWeekend = !!exc.weekendExempt;
      break;
    }

    // Track weekend-exempt DBs (for display purposes on weekdays)
    if (!isExcluded) {
      for (const pat of weekendPatterns) {
        if (nameMatchesPattern(name, pat)) {
          weekendExemptNames.push(displayName);
          break;
        }
      }
    }

    if (isExcluded) {
      excluded.push(item);
      excludedNames.push(displayName);
      excludedReasons.set(displayName, excludeReason);
      if (excludedAsWeekend) {
        excludedWeekendItems.push({ name: displayName, account: accountName, reason: excludeReason });
      } else {
        excludedPermanentItems.push({ name: displayName, account: accountName, reason: excludeReason });
      }
    } else {
      included.push(item);
    }
  }
  return { included, excluded, excludedNames, excludedReasons, weekendExemptNames, excludedWeekendItems, excludedPermanentItems };
}
