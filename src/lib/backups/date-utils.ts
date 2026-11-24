/**
 * Returns a date in Bogotá timezone offset by `daysAgo` as YYYYMMDD string.
 * daysAgo=1 → yesterday, daysAgo=2 → antier, etc.
 */
function getBogotaDateDaysAgo(daysAgo: number): string {
  const now = new Date();
  const bogotaOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const bogotaMs = utcMs + bogotaOffset * 60000;
  const bogotaDate = new Date(bogotaMs);
  bogotaDate.setDate(bogotaDate.getDate() - daysAgo);
  const y = bogotaDate.getFullYear();
  const m = String(bogotaDate.getMonth() + 1).padStart(2, "0");
  const d = String(bogotaDate.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Yesterday in Bogotá as YYYYMMDD */
export function getYesterdayBogotaDate(): string {
  return getBogotaDateDaysAgo(1);
}

/** Antier (2 days ago) in Bogotá as YYYYMMDD */
export function getTwoDaysAgoBogotaDate(): string {
  return getBogotaDateDaysAgo(2);
}

/** 3 days ago in Bogotá as YYYYMMDD */
export function getThreeDaysAgoBogotaDate(): string {
  return getBogotaDateDaysAgo(3);
}

/** Returns the last N dates (from yesterday back) in Bogotá as YYYYMMDD strings. */
export function getRecentBogotaDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => getBogotaDateDaysAgo(i + 1));
}

/** Check if a YYYYMMDD date string falls on a weekend (Saturday or Sunday) in Bogotá timezone. */
export function isWeekend(ymd: string): boolean {
  const y = parseInt(ymd.substring(0, 4), 10);
  const m = parseInt(ymd.substring(4, 6), 10) - 1;
  const d = parseInt(ymd.substring(6, 8), 10);
  const date = new Date(Date.UTC(y, m, d));
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  return dow === 0 || dow === 6;
}
